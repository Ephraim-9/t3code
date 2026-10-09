import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";

import { toastManager } from "~/components/ui/toast";
import { isElectron } from "~/env";
import { assetEnvironment } from "~/state/assets";
import { usePreparedConnection } from "~/state/session";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";

function saveUrl(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
}

/**
 * Returns a function that saves one file from the environment host's disk to this device.
 * A browser follows the signed URL itself, so the file streams to disk and the server's
 * `Content-Disposition` names it. The desktop app goes through a Blob instead: navigating its
 * custom app scheme to a remote origin would hand the download to an external browser.
 */
export function useDownloadHostFile(environmentId: EnvironmentId | null) {
  const connection = usePreparedConnection(environmentId);
  const httpBaseUrl = connection._tag === "Some" ? connection.value.httpBaseUrl : null;
  const createUrl = useAtomQueryRunner(assetEnvironment.createUrl, {
    reportFailure: false,
    refresh: true,
  });

  return useCallback(
    async (absolutePath: string) => {
      const fileName = absolutePath.split(/[\\/]/).findLast(Boolean) ?? "download";
      try {
        if (environmentId === null || httpBaseUrl === null) {
          throw new Error("Reconnect to the environment and try again.");
        }
        const result = await createUrl({
          environmentId,
          input: { resource: { _tag: "file-download", path: absolutePath } },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        if (result._tag !== "Success") return;
        const url = resolveAssetUrl(httpBaseUrl, result.value.relativeUrl);
        if (url === null) throw new Error("The download link could not be built.");
        if (!isElectron) {
          saveUrl(url, fileName);
          return;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error("The file could not be loaded. Try again.");
        const blobUrl = URL.createObjectURL(await response.blob());
        try {
          saveUrl(blobUrl, fileName);
        } finally {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
        }
      } catch (cause) {
        toastManager.add({
          type: "error",
          title: "Could not download file",
          description: cause instanceof Error ? cause.message : absolutePath,
        });
      }
    },
    [createUrl, environmentId, httpBaseUrl],
  );
}
