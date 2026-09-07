export interface ServiceDependencies {
  now: () => string;
  generateId: () => string;
}

export const defaultServiceDependencies: ServiceDependencies = {
  now: () => new Date().toISOString(),
  generateId: () => crypto.randomUUID(),
};
