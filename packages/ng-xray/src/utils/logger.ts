import pc from 'picocolors';

export const logger = {
  log: (message: string) => console.log(message),
  info: (message: string) => console.log(pc.blue(message)),
  success: (message: string) => console.log(pc.green(message)),
  warn: (message: string) => console.log(pc.yellow(message)),
  error: (message: string) => console.error(pc.red(message)),
  debug: (message: string) => {
    if (process.env.NG_XRAY_DEBUG) console.log(pc.dim(message));
  },
  dim: (message: string) => console.log(pc.dim(message)),
  break: () => console.log(),
};

export const hl = {
  info: (text: string) => pc.blue(text),
  success: (text: string) => pc.green(text),
  warn: (text: string) => pc.yellow(text),
  error: (text: string) => pc.red(text),
  dim: (text: string) => pc.dim(text),
  bold: (text: string) => pc.bold(text),
};
