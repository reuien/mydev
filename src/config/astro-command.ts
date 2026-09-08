const ASTRO_COMMANDS = ['build', 'check', 'dev', 'preview'] as const;

export function resolveAstroCommand(arguments_: readonly string[]): string {
  return arguments_.find((argument) => ASTRO_COMMANDS.some((command) => command === argument)) ?? 'default';
}
