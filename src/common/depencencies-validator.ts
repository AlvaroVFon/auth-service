export function assertDependencies(
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: Record<string, any>,
  context: string,
): void {
  Object.entries(deps).forEach(([name, value]) => {
    if (value === undefined || value === null) {
      console.error(
        `[BOOTSTRAP ERROR] Missing dependency '${name}' in ${context}`,
      );
      process.exit(1);
    }
  });
}
