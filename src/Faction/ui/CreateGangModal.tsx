import React from "react";
import { Modal } from "../../ui/React/Modal";
import { Router } from "../../ui/GameRoot";
import { Page } from "../../ui/Router";
import { Player } from "@player";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { KEY } from "../../utils/helpers/keyCodes";
import { FactionName } from "@enums";

interface IProps {
  open: boolean;
  onClose: () => void;
  facName: string;
}

/** React Component for the popup used to create a new gang. */
export function CreateGangModal(props: IProps): React.ReactElement {
  const combatGangText =
    "This is a COMBAT gang. Members in this gang will have different tasks than HACKING gangs. " +
    "Compared to hacking gangs, progression with combat gangs can be more difficult as territory management " +
    "is more important. However, well-managed combat gangs can progress faster than hacking ones.";

  const hackingGangText =
    "This is a HACKING gang. Members in this gang will have different tasks than COMBAT gangs. " +
    "Compared to combat gangs, progression with hacking gangs is more straightforward as territory warfare " +
    "is not as important.";

  function isHacking(): boolean {
    return [FactionName.NiteSec as string, FactionName.TheBlackHand as string].includes(props.facName);
  }

  function createGang(): void {
    Player.startGang(props.facName, isHacking());
    props.onClose();
    Router.toPage(Page.Gang);
  }

  function onKeyUp(event: React.KeyboardEvent): void {
    if (event.key === KEY.ENTER) createGang();
  }

  return (
    <Modal open={props.open} onClose={props.onClose}>
      <Typography>
        Would you like to create a new Gang with {props.facName}?
        <br />
        <br />
        Note that this will prevent you from creating a Gang with any other Faction until this BitNode is destroyed. It
        also resets your reputation with this faction.
        <br />
        <br />
        {isHacking() ? hackingGangText : combatGangText}
        <br />
        <br />
        Other than hacking vs combat, there are NO differences between the Factions you can create a Gang with, and each
        of these Factions have all Augmentations available.
      </Typography>
      <Button onClick={createGang} onKeyUp={onKeyUp} autoFocus>
        Create Gang
      </Button>
    </Modal>
  );
}
