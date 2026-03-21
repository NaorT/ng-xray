import ora, { type Ora } from "ora";

export const createSpinner = (text: string): Ora => ora({ text, spinner: "dots" });
