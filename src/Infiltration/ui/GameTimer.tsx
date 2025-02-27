import { Paper } from "@mui/material";
import React, { useEffect, useState } from "react";
import { AugmentationName } from "@enums";
import { Player } from "@player";
import { ProgressBar } from "../../ui/React/Progress";

interface IProps {
  millis: number;
  onExpire: () => void;
  noPaper?: boolean;
  ignoreAugment_WKSharmonizer?: boolean;
}

export function GameTimer(props: IProps): React.ReactElement {
  const [v, setV] = useState(100);
  const totalMillis =
    (!props.ignoreAugment_WKSharmonizer && Player.hasAugmentation(AugmentationName.WKSharmonizer, true) ? 1.3 : 1) *
    props.millis;

  const tick = 200;
  useEffect(() => {
    const intervalId = setInterval(() => {
      setV((old) => {
        if (old <= 0) props.onExpire();
        return old - (tick / totalMillis) * 100;
      });
    }, tick);
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // https://stackoverflow.com/questions/55593367/disable-material-uis-linearprogress-animation
  // TODO(hydroflame): there's like a bug where it triggers the end before the
  // bar physically reaches the end
  return props.noPaper ? (
    <ProgressBar variant="determinate" value={v} color="primary" />
  ) : (
    <Paper sx={{ p: 1, mb: 1 }}>
      <ProgressBar variant="determinate" value={v} color="primary" />
    </Paper>
  );
}
