import type { NextConfig } from "next";
import { withEve } from "eve/next";

syncPortFromNextDevArgs();

const nextConfig: NextConfig = {
  cacheComponents: true,
  turbopack: {
    root: process.cwd(),
  },
};

export default withEve(nextConfig);

function syncPortFromNextDevArgs() {
  if (process.env.PORT) {
    return;
  }

  const port = readFlagValue(process.argv, "port") ?? readFlagValue(process.argv, "p");

  if (port && /^\d+$/.test(port)) {
    process.env.PORT = port;
  }
}

function readFlagValue(argv: readonly string[], name: string) {
  const longPrefix = `--${name}=`;
  const longIndex = argv.indexOf(`--${name}`);
  const shortIndex = argv.indexOf(`-${name}`);
  const inline = argv.find((arg) => arg.startsWith(longPrefix));

  if (inline) {
    return inline.slice(longPrefix.length);
  }

  const index = longIndex === -1 ? shortIndex : longIndex;

  return index === -1 ? undefined : argv[index + 1];
}
