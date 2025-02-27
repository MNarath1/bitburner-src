import { Output, Link, RawOutput, TTimer } from "./OutputTypes";
import { Router } from "../ui/GameRoot";
import { Player } from "@player";
import { HacknetServer } from "../Hacknet/HacknetServer";
import { BaseServer } from "../Server/BaseServer";
import { Server } from "../Server/Server";
import { CompletedProgramName } from "@enums";
import { CodingContractResult } from "../CodingContracts";
import { TerminalEvents, TerminalClearEvents } from "./TerminalEvents";

import { TextFile } from "../TextFile";
import { Script } from "../Script/Script";
import { hasScriptExtension } from "../Paths/ScriptFilePath";
import { CONSTANTS } from "../Constants";
import { GetServer, GetAllServers } from "../Server/AllServers";

import { checkIfConnectedToDarkweb } from "../DarkWeb/DarkWeb";
import { iTutorialNextStep, iTutorialSteps, ITutorial } from "../InteractiveTutorial";
import { getServerOnNetwork, processSingleServerGrowth } from "../Server/ServerHelpers";
import { parseCommand, parseCommands } from "./Parser";
import { SpecialServers } from "../Server/data/SpecialServers";
import { Settings } from "../Settings/Settings";
import { createProgressBarText } from "../utils/helpers/createProgressBarText";
import {
  calculateHackingChance,
  calculateHackingExpGain,
  calculatePercentMoneyHacked,
  calculateHackingTime,
  calculateGrowTime,
  calculateWeakenTime,
} from "../Hacking";
import { formatExp, formatMoney, formatPercent, formatRam, formatSecurity } from "../ui/formatNumber";
import { convertTimeMsToTimeElapsedString } from "../utils/StringHelperFunctions";

// TODO: Does every terminal function really need its own file...?
import { alias } from "./commands/alias";
import { analyze } from "./commands/analyze";
import { backdoor } from "./commands/backdoor";
import { buy } from "./commands/buy";
import { cat } from "./commands/cat";
import { cd } from "./commands/cd";
import { check } from "./commands/check";
import { connect } from "./commands/connect";
import { cp } from "./commands/cp";
import { download } from "./commands/download";
import { expr } from "./commands/expr";
import { free } from "./commands/free";
import { grow } from "./commands/grow";
import { hack } from "./commands/hack";
import { help } from "./commands/help";
import { history } from "./commands/history";
import { home } from "./commands/home";
import { hostname } from "./commands/hostname";
import { kill } from "./commands/kill";
import { killall } from "./commands/killall";
import { ls } from "./commands/ls";
import { lscpu } from "./commands/lscpu";
import { mem } from "./commands/mem";
import { mv } from "./commands/mv";
import { nano } from "./commands/nano";
import { ps } from "./commands/ps";
import { rm } from "./commands/rm";
import { run } from "./commands/run";
import { scan } from "./commands/scan";
import { scananalyze } from "./commands/scananalyze";
import { scp } from "./commands/scp";
import { sudov } from "./commands/sudov";
import { tail } from "./commands/tail";
import { top } from "./commands/top";
import { unalias } from "./commands/unalias";
import { vim } from "./commands/vim";
import { weaken } from "./commands/weaken";
import { wget } from "./commands/wget";
import { hash } from "../hash/hash";
import { apr1 } from "./commands/apr1";
import { changelog } from "./commands/changelog";
import { currentNodeMults } from "../BitNode/BitNodeMultipliers";
import { Engine } from "../engine";
import { Directory, resolveDirectory, root } from "../Paths/Directory";
import { FilePath, isFilePath, resolveFilePath } from "../Paths/FilePath";
import { hasTextExtension } from "../Paths/TextFilePath";
import { ContractFilePath } from "../Paths/ContractFilePath";

export class Terminal {
  // Flags to determine whether the player is currently running a hack or an analyze
  action: TTimer | null = null;

  commandHistory: string[] = [];
  commandHistoryIndex = 0;

  outputHistory: (Output | Link | RawOutput)[] = [
    new Output(`Bitburner v${CONSTANTS.VersionString} (${hash()})`, "primary"),
  ];

  // True if a Coding Contract prompt is opened
  contractOpen = false;

  // Path of current directory
  currDir = "" as Directory;

  process(cycles: number): void {
    if (this.action === null) return;
    this.action.timeLeft -= (CONSTANTS.MilliPerCycle * cycles) / 1000;
    if (this.action.timeLeft < 0.01) this.finishAction(false);
  }

  append(item: Output | Link | RawOutput): void {
    this.outputHistory.push(item);
    if (this.outputHistory.length > Settings.MaxTerminalCapacity) {
      this.outputHistory.splice(0, this.outputHistory.length - Settings.MaxTerminalCapacity);
    }
    TerminalEvents.emit();
  }

  print(s: string): void {
    this.append(new Output(s, "primary"));
  }

  printRaw(node: React.ReactNode): void {
    this.append(new RawOutput(node));
  }

  error(s: string): void {
    this.append(new Output(s, "error"));
  }

  success(s: string): void {
    this.append(new Output(s, "success"));
  }

  info(s: string): void {
    this.append(new Output(s, "info"));
  }

  warn(s: string): void {
    this.append(new Output(s, "warn"));
  }

  startHack(): void {
    // Hacking through Terminal should be faster than hacking through a script
    const server = Player.getCurrentServer();
    if (server instanceof HacknetServer) {
      this.error("Cannot hack this kind of server");
      return;
    }
    if (!(server instanceof Server)) throw new Error("server should be normal server");
    this.startAction(calculateHackingTime(server, Player) / 4, "h", server);
  }

  startGrow(): void {
    const server = Player.getCurrentServer();
    if (server instanceof HacknetServer) {
      this.error("Cannot grow this kind of server");
      return;
    }
    if (!(server instanceof Server)) throw new Error("server should be normal server");
    this.startAction(calculateGrowTime(server, Player) / 16, "g", server);
  }
  startWeaken(): void {
    const server = Player.getCurrentServer();
    if (server instanceof HacknetServer) {
      this.error("Cannot weaken this kind of server");
      return;
    }
    if (!(server instanceof Server)) throw new Error("server should be normal server");
    this.startAction(calculateWeakenTime(server, Player) / 16, "w", server);
  }

  startBackdoor(): void {
    // Backdoor should take the same amount of time as hack
    const server = Player.getCurrentServer();
    if (server instanceof HacknetServer) {
      this.error("Cannot backdoor this kind of server");
      return;
    }
    if (!(server instanceof Server)) throw new Error("server should be normal server");
    this.startAction(calculateHackingTime(server, Player) / 4, "b", server);
  }

  startAnalyze(): void {
    this.print("Analyzing system...");
    const server = Player.getCurrentServer();
    this.startAction(1, "a", server);
  }

  startAction(n: number, action: "h" | "b" | "a" | "g" | "w", server?: BaseServer): void {
    this.action = new TTimer(n, action, server);
  }

  // Complete the hack/analyze command
  finishHack(server: BaseServer, cancelled = false): void {
    if (cancelled) return;

    if (server instanceof HacknetServer) {
      this.error("Cannot hack this kind of server");
      return;
    }
    if (!(server instanceof Server)) throw new Error("server should be normal server");

    // Calculate whether hack was successful
    const hackChance = calculateHackingChance(server, Player);
    const rand = Math.random();
    const expGainedOnSuccess = calculateHackingExpGain(server, Player);
    const expGainedOnFailure = expGainedOnSuccess / 4;
    if (rand < hackChance) {
      // Success!
      server.backdoorInstalled = true;
      if (SpecialServers.WorldDaemon === server.hostname) {
        Router.toBitVerse(false, false);
        return;
      }
      // Manunally check for faction invites
      Engine.Counters.checkFactionInvitations = 0;
      Engine.checkCounters();

      let moneyGained = calculatePercentMoneyHacked(server, Player) * currentNodeMults.ManualHackMoney;
      moneyGained = Math.floor(server.moneyAvailable * moneyGained);

      if (moneyGained <= 0) {
        moneyGained = 0;
      } // Safety check

      server.moneyAvailable -= moneyGained;
      Player.gainMoney(moneyGained, "hacking");
      Player.gainHackingExp(expGainedOnSuccess);
      Player.gainIntelligenceExp(expGainedOnSuccess / CONSTANTS.IntelligenceTerminalHackBaseExpGain);

      const oldSec = server.hackDifficulty;
      server.fortify(CONSTANTS.ServerFortifyAmount);
      const newSec = server.hackDifficulty;

      this.print(
        `Hack successful on '${server.hostname}'! Gained ${formatMoney(moneyGained)} and ${formatExp(
          expGainedOnSuccess,
        )} hacking exp`,
      );
      this.print(
        `Security increased on '${server.hostname}' from ${formatSecurity(oldSec)} to ${formatSecurity(newSec)}`,
      );
    } else {
      // Failure
      Player.gainHackingExp(expGainedOnFailure);
      this.print(`Failed to hack '${server.hostname}'. Gained ${formatExp(expGainedOnFailure)} hacking exp`);
    }
  }

  finishGrow(server: BaseServer, cancelled = false): void {
    if (cancelled) return;

    if (server instanceof HacknetServer) {
      this.error("Cannot grow this kind of server");
      return;
    }
    if (!(server instanceof Server)) throw new Error("server should be normal server");
    const expGain = calculateHackingExpGain(server, Player);
    const oldSec = server.hackDifficulty;
    const growth = processSingleServerGrowth(server, 25, server.cpuCores) - 1;
    const newSec = server.hackDifficulty;

    Player.gainHackingExp(expGain);
    this.print(
      `Available money on '${server.hostname}' grown by ${formatPercent(growth, 6)}. Gained ${formatExp(
        expGain,
      )} hacking exp.`,
    );
    this.print(
      `Security increased on '${server.hostname}' from ${formatSecurity(oldSec)} to ${formatSecurity(newSec)}`,
    );
  }

  finishWeaken(server: BaseServer, cancelled = false): void {
    if (cancelled) return;

    if (server instanceof HacknetServer) {
      this.error("Cannot weaken this kind of server");
      return;
    }
    if (!(server instanceof Server)) throw new Error("server should be normal server");
    const expGain = calculateHackingExpGain(server, Player);
    const oldSec = server.hackDifficulty;
    server.weaken(CONSTANTS.ServerWeakenAmount);
    const newSec = server.hackDifficulty;

    Player.gainHackingExp(expGain);
    this.print(
      `Security decreased on '${server.hostname}' from ${formatSecurity(oldSec)} to ${formatSecurity(
        newSec,
      )} (min: ${formatSecurity(server.minDifficulty)})` + ` and Gained ${formatExp(expGain)} hacking exp.`,
    );
  }

  finishBackdoor(server: BaseServer, cancelled = false): void {
    if (!cancelled) {
      if (server instanceof HacknetServer) {
        this.error("Cannot hack this kind of server");
        return;
      }
      if (!(server instanceof Server)) throw new Error("server should be normal server");
      server.backdoorInstalled = true;
      if (SpecialServers.WorldDaemon === server.hostname) {
        if (Player.bitNodeN == null) {
          Player.bitNodeN = 1;
        }
        Router.toBitVerse(false, false);
        return;
      }
      // Manunally check for faction invites
      Engine.Counters.checkFactionInvitations = 0;
      Engine.checkCounters();

      this.print(`Backdoor on '${server.hostname}' successful!`);
    }
  }

  finishAnalyze(currServ: BaseServer, cancelled = false): void {
    if (!cancelled) {
      const isHacknet = currServ instanceof HacknetServer;
      this.print(currServ.hostname + ": ");
      const org = currServ.organizationName;
      this.print("Organization name: " + (!isHacknet ? org : "player"));
      const hasAdminRights = (!isHacknet && currServ.hasAdminRights) || isHacknet;
      this.print("Root Access: " + (hasAdminRights ? "YES" : "NO"));
      const canRunScripts = hasAdminRights && currServ.maxRam > 0;
      this.print("Can run scripts on this host: " + (canRunScripts ? "YES" : "NO"));
      this.print("RAM: " + formatRam(currServ.maxRam));
      if (currServ instanceof Server) {
        this.print("Backdoor: " + (currServ.backdoorInstalled ? "YES" : "NO"));
        const hackingSkill = currServ.requiredHackingSkill;
        this.print("Required hacking skill for hack() and backdoor: " + (!isHacknet ? hackingSkill : "N/A"));
        const security = currServ.hackDifficulty;
        this.print("Server security level: " + (!isHacknet ? formatSecurity(security) : "N/A"));
        const hackingChance = calculateHackingChance(currServ, Player);
        this.print("Chance to hack: " + (!isHacknet ? formatPercent(hackingChance) : "N/A"));
        const hackingTime = calculateHackingTime(currServ, Player) * 1000;
        this.print("Time to hack: " + (!isHacknet ? convertTimeMsToTimeElapsedString(hackingTime, true) : "N/A"));
      }
      this.print(
        `Total money available on server: ${currServ instanceof Server ? formatMoney(currServ.moneyAvailable) : "N/A"}`,
      );
      if (currServ instanceof Server) {
        const numPort = currServ.numOpenPortsRequired;
        this.print("Required number of open ports for NUKE: " + (!isHacknet ? numPort : "N/A"));
        this.print("SSH port: " + (currServ.sshPortOpen ? "Open" : "Closed"));
        this.print("FTP port: " + (currServ.ftpPortOpen ? "Open" : "Closed"));
        this.print("SMTP port: " + (currServ.smtpPortOpen ? "Open" : "Closed"));
        this.print("HTTP port: " + (currServ.httpPortOpen ? "Open" : "Closed"));
        this.print("SQL port: " + (currServ.sqlPortOpen ? "Open" : "Closed"));
      }
    }
  }

  finishAction(cancelled = false): void {
    if (this.action === null) {
      if (!cancelled) throw new Error("Finish action called when there was no action");
      return;
    }

    if (!this.action.server) throw new Error("Missing action target server");

    this.print(this.getProgressText());
    if (this.action.action === "h") {
      this.finishHack(this.action.server, cancelled);
    } else if (this.action.action === "g") {
      this.finishGrow(this.action.server, cancelled);
    } else if (this.action.action === "w") {
      this.finishWeaken(this.action.server, cancelled);
    } else if (this.action.action === "b") {
      this.finishBackdoor(this.action.server, cancelled);
    } else if (this.action.action === "a") {
      this.finishAnalyze(this.action.server, cancelled);
    }

    if (cancelled) {
      this.print("Cancelled");
    }
    this.action = null;
    TerminalEvents.emit();
  }

  getFile(filename: string): Script | TextFile | string | null {
    if (hasScriptExtension(filename)) return this.getScript(filename);
    if (hasTextExtension(filename)) return this.getTextFile(filename);
    if (filename.endsWith(".lit")) return this.getLitFile(filename);
    return null;
  }

  getFilepath(path: string, useAbsolute?: boolean): FilePath | null {
    // If path starts with a slash, consider it to be an absolute path
    if (useAbsolute || path.startsWith("/")) return resolveFilePath(path);
    // Otherwise, force path to be seen as relative to the current directory.
    path = "./" + path;
    return resolveFilePath(path, this.currDir);
  }

  getDirectory(path: string, useAbsolute?: boolean): Directory | null {
    // If path starts with a slash, consider it to be an absolute path
    if (useAbsolute || path.startsWith("/")) return resolveDirectory(path);
    // Otherwise, force path to be seen as relative to the current directory.
    path = "./" + path;
    return resolveDirectory(path, this.currDir);
  }

  getScript(filename: string): Script | null {
    const server = Player.getCurrentServer();
    const filepath = this.getFilepath(filename);
    if (!filepath || !hasScriptExtension(filepath)) return null;
    return server.scripts.get(filepath) ?? null;
  }

  getTextFile(filename: string): TextFile | null {
    const server = Player.getCurrentServer();
    const filepath = this.getFilepath(filename);
    if (!filepath || !hasTextExtension(filepath)) return null;
    return server.textFiles.get(filepath) ?? null;
  }

  getLitFile(filename: string): string | null {
    const s = Player.getCurrentServer();
    const filepath = this.getFilepath(filename);
    if (!filepath) return null;
    for (const lit of s.messages) {
      if (typeof lit === "string" && filepath === lit) {
        return lit;
      }
    }

    return null;
  }

  cwd(): Directory {
    return this.currDir;
  }

  setcwd(dir: Directory): void {
    this.currDir = dir;
    TerminalEvents.emit();
  }

  async runContract(contractPath: ContractFilePath): Promise<void> {
    // There's already an opened contract
    if (this.contractOpen) {
      return this.error("There's already a Coding Contract in Progress");
    }

    const serv = Player.getCurrentServer();
    const contract = serv.getContract(contractPath);
    if (!contract) return this.error("No such contract");

    this.contractOpen = true;
    const res = await contract.prompt();

    //Check if the contract still exists by the time the promise is fulfilled
    if (serv.getContract(contractPath) == null) {
      this.contractOpen = false;
      return this.error("Contract no longer exists (Was it solved by a script?)");
    }

    switch (res) {
      case CodingContractResult.Success:
        if (contract.reward !== null) {
          const reward = Player.gainCodingContractReward(contract.reward, contract.getDifficulty());
          this.print(`Contract SUCCESS - ${reward}`);
        }
        serv.removeContract(contract);
        break;
      case CodingContractResult.Failure:
        ++contract.tries;
        if (contract.tries >= contract.getMaxNumTries()) {
          this.error("Contract FAILED - Contract is now self-destructing");
          serv.removeContract(contract);
        } else {
          this.error(`Contract FAILED - ${contract.getMaxNumTries() - contract.tries} tries remaining`);
        }
        break;
      case CodingContractResult.Cancelled:
      default:
        this.print("Contract cancelled");
        break;
    }
    this.contractOpen = false;
  }

  executeScanAnalyzeCommand(depth = 1, all = false): void {
    // TODO Using array as stack for now, can make more efficient
    this.print("~~~~~~~~~~ Beginning scan-analyze ~~~~~~~~~~");
    this.print(" ");

    // Map of all servers to keep track of which have been visited
    const visited: Record<string, number | undefined> = {};
    for (const server of GetAllServers()) {
      visited[server.hostname] = 0;
    }

    const stack: BaseServer[] = [];
    const depthQueue: number[] = [0];
    const currServ = Player.getCurrentServer();
    stack.push(currServ);
    while (stack.length != 0) {
      const s = stack.pop();
      if (!s) continue;
      const d = depthQueue.pop();
      if (d === undefined) continue;
      const isHacknet = s instanceof HacknetServer;
      if (!all && s.purchasedByPlayer && s.hostname != "home") {
        continue; // Purchased server
      } else if (visited[s.hostname] || d > depth) {
        continue; // Already visited or out-of-depth
      } else if (!all && isHacknet) {
        continue; // Hacknet Server
      } else {
        visited[s.hostname] = 1;
      }
      for (let i = s.serversOnNetwork.length - 1; i >= 0; --i) {
        const newS = getServerOnNetwork(s, i);
        if (newS === null) continue;
        stack.push(newS);
        depthQueue.push(d + 1);
      }
      if (d == 0) {
        continue;
      } // Don't print current server
      const titleDashes = Array((d - 1) * 4 + 1).join("-");
      if (Player.hasProgram(CompletedProgramName.autoLink)) {
        this.append(new Link(titleDashes, s.hostname));
      } else {
        this.print(titleDashes + s.hostname);
      }

      const dashes = titleDashes + "--";
      let c = "NO";
      if (s.hasAdminRights) {
        c = "YES";
      }
      if (s instanceof Server) {
        this.print(`${dashes}Root Access: ${c}, Required hacking skill: ${s.requiredHackingSkill}`);
        this.print(`${dashes}Number of open ports required to NUKE: ${s.numOpenPortsRequired}`);
      }
      this.print(dashes + "RAM: " + formatRam(s.maxRam));
      this.print(" ");
    }
  }

  connectToServer(server: string): void {
    const serv = GetServer(server);
    if (serv == null) {
      this.error("Invalid server. Connection failed.");
      return;
    }
    Player.getCurrentServer().isConnectedTo = false;
    Player.currentServer = serv.hostname;
    Player.getCurrentServer().isConnectedTo = true;
    this.print("Connected to " + serv.hostname);
    this.setcwd(root);
    if (Player.getCurrentServer().hostname == "darkweb") {
      checkIfConnectedToDarkweb(); // Posts a 'help' message if connecting to dark web
    }
  }

  executeCommands(commands: string): void {
    // Handle Terminal History - multiple commands should be saved as one
    if (this.commandHistory[this.commandHistory.length - 1] != commands) {
      this.commandHistory.push(commands);
      if (this.commandHistory.length > 50) {
        this.commandHistory.splice(0, 1);
      }
      Player.terminalCommandHistory = this.commandHistory;
    }
    this.commandHistoryIndex = this.commandHistory.length;
    const allCommands = parseCommands(commands);
    for (const command of allCommands) this.executeCommand(command);
  }

  clear(): void {
    this.outputHistory = [new Output(`Bitburner v${CONSTANTS.VersionString} (${hash()})`, "primary")];
    TerminalEvents.emit();
    TerminalClearEvents.emit();
  }

  prestige(): void {
    this.action = null;
    this.clear();
  }

  executeCommand(command: string): void {
    if (this.action !== null) return this.error(`Cannot execute command (${command}) while an action is in progress`);

    const commandArray = parseCommand(command);
    if (!commandArray.length) return;

    const currentServer = Player.getCurrentServer();
    /****************** Interactive Tutorial Terminal Commands ******************/
    if (ITutorial.isRunning) {
      const n00dlesServ = GetServer("n00dles");
      if (n00dlesServ == null) {
        throw new Error("Could not get n00dles server");
      }
      switch (ITutorial.currStep) {
        case iTutorialSteps.TerminalHelp:
          if (commandArray.length === 1 && commandArray[0] == "help") {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalLs:
          if (commandArray.length === 1 && commandArray[0] == "ls") {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalScan:
          if (commandArray.length === 1 && commandArray[0] == "scan") {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalScanAnalyze1:
          if (commandArray.length == 1 && commandArray[0] == "scan-analyze") {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalScanAnalyze2:
          if (commandArray.length == 2 && commandArray[0] == "scan-analyze" && commandArray[1] === 2) {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalConnect:
          if (commandArray.length == 2) {
            if (
              commandArray[0] == "connect" &&
              (commandArray[1] == "n00dles" || commandArray[1] == n00dlesServ.hostname)
            ) {
              iTutorialNextStep();
            } else {
              this.error("Wrong command! Try again!");
              return;
            }
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalAnalyze:
          if (commandArray.length === 1 && commandArray[0] === "analyze") {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalNuke:
          if (commandArray.length == 2 && commandArray[0] == "run" && commandArray[1] == "NUKE.exe") {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalManualHack:
          if (commandArray.length == 1 && commandArray[0] == "hack") {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalHackingMechanics:
          if (commandArray.length !== 1 || !["grow", "weaken", "hack"].includes(commandArray[0] + "")) {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalGoHome:
          if (commandArray.length == 1 && commandArray[0] == "home") {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalCreateScript:
          if (
            commandArray.length == 2 &&
            commandArray[0] == "nano" &&
            (commandArray[1] == "n00dles.script" || commandArray[1] == "n00dles.js")
          ) {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalFree:
          if (commandArray.length == 1 && commandArray[0] == "free") {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.TerminalRunScript:
          if (
            commandArray.length == 2 &&
            commandArray[0] == "run" &&
            (commandArray[1] == "n00dles.script" || commandArray[1] == "n00dles.js")
          ) {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        case iTutorialSteps.ActiveScriptsToTerminal:
          if (
            commandArray.length == 2 &&
            commandArray[0] == "tail" &&
            (commandArray[1] == "n00dles.script" || commandArray[1] == "n00dles.js")
          ) {
            iTutorialNextStep();
          } else {
            this.error("Bad command. Please follow the tutorial");
            return;
          }
          break;
        default:
          this.error("Please follow the tutorial, or click 'EXIT' if you'd like to skip it");
          return;
      }
    }
    /****************** END INTERACTIVE TUTORIAL ******************/
    /* Command parser */

    const commandName = commandArray[0];
    if (typeof commandName !== "string") return this.error(`${commandName} is not a valid command.`);
    // run by path command
    if (isFilePath(commandName)) return run(commandArray, currentServer);

    // Aside from the run-by-path command, we don't need the first entry once we've stored it in commandName.
    commandArray.shift();

    const commands: Record<string, (args: (string | number | boolean)[], server: BaseServer) => void> = {
      "scan-analyze": scananalyze,
      alias: alias,
      analyze: analyze,
      backdoor: backdoor,
      buy: buy,
      cat: cat,
      cd: cd,
      changelog: changelog,
      check: check,
      clear: () => this.clear(),
      cls: () => this.clear(),
      connect: connect,
      cp: cp,
      download: download,
      expr: expr,
      free: free,
      grow: grow,
      hack: hack,
      help: help,
      history: history,
      home: home,
      hostname: hostname,
      kill: kill,
      killall: killall,
      ls: ls,
      lscpu: lscpu,
      mem: mem,
      mv: mv,
      nano: nano,
      ps: ps,
      rm: rm,
      run: run,
      scan: scan,
      scp: scp,
      sudov: sudov,
      tail: tail,
      apr1: apr1,
      top: top,
      unalias: unalias,
      vim: vim,
      weaken: weaken,
      wget: wget,
    };

    const f = commands[commandName.toLowerCase()];
    if (!f) return this.error(`Command ${commandName} not found`);

    f(commandArray, currentServer);
  }

  getProgressText(): string {
    if (this.action === null) throw new Error("trying to get the progress text when there's no action");
    return createProgressBarText({
      progress: (this.action.time - this.action.timeLeft) / this.action.time,
      totalTicks: 50,
    });
  }
}
