export type CommandName = 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'validate';
export type TargetEnvironment = 'local' | 'production';
export type CliCommand = { name: CommandName; file: string; environment: TargetEnvironment };

const names = new Set<CommandName>(['create', 'update', 'delete', 'publish', 'unpublish', 'validate']);

export function parseCommand(arguments_: string[]): CliCommand {
  const [name, file, ...options] = arguments_;
  if (!names.has(name as CommandName) || !file) throw new Error('Usage: publish <command> <file> [--env local|production]');
  if (options.length === 0) return { name: name as CommandName, file, environment: 'local' };
  if (options.length !== 2 || options[0] !== '--env' || !['local', 'production'].includes(options[1] ?? '')) {
    throw new Error('Environment must be local or production');
  }
  return { name: name as CommandName, file, environment: options[1] as TargetEnvironment };
}

export const HELP = `MyDev Markdown publisher

create <file> [--env local|production]
update <file> [--env local|production]
delete <file> [--env local|production]
publish <file> [--env local|production]
unpublish <file> [--env local|production]
validate <file>`;
