const reactRuntimePackages = ["react", "react-dom"];

export function sharedReactRuntimeFailures({
  manifest,
  rootRuntimes,
  consumerRuntimes,
  scopedConsumer,
}) {
  const failures = [];
  const expectedVersions = new Map(
    reactRuntimePackages.map((packageName) => [
      packageName,
      manifest.dependencies?.[packageName],
    ]),
  );

  if (
    [...expectedVersions.values()].some(
      (version) => typeof version !== "string" || version.length === 0,
    ) ||
    new Set(expectedVersions.values()).size !== 1
  ) {
    failures.push("React and React DOM must declare one matching runtime version");
  }

  for (const [packageName, expectedVersion] of expectedVersions) {
    const scopedResolution = `${scopedConsumer}/${packageName}`;
    if (manifest.resolutions?.[scopedResolution] !== expectedVersion) {
      failures.push(
        `${scopedResolution} must match the application ${packageName} version`,
      );
    }
    if (manifest.resolutions?.[packageName] !== undefined) {
      failures.push(
        `${packageName} must not use an unscoped resolution to hide incompatible consumers`,
      );
    }

    const rootRuntime = rootRuntimes.get(packageName);
    if (
      rootRuntime?.version !== expectedVersion ||
      typeof rootRuntime?.manifestPath !== "string" ||
      rootRuntime.manifestPath.length === 0
    ) {
      failures.push(`The installed ${packageName} root must match the manifest`);
      continue;
    }

    for (const [consumerName, runtimes] of consumerRuntimes) {
      const consumerRuntime = runtimes.get(packageName);
      if (consumerRuntime?.version !== expectedVersion) {
        failures.push(
          `${consumerName} resolves ${packageName} outside the application version`,
        );
      }
      if (consumerRuntime?.manifestPath !== rootRuntime.manifestPath) {
        failures.push(
          `${consumerName} resolves a different physical ${packageName} runtime`,
        );
      }
    }
  }

  if (!consumerRuntimes.has(scopedConsumer)) {
    failures.push(`Missing scoped React consumer ${scopedConsumer}`);
  }

  return failures;
}
