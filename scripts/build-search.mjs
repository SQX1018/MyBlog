import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as pagefind from "pagefind";

function checkErrors(result) {
  if (result.errors?.length) throw new Error(result.errors.join("\n"));
}

try {
  const created = await pagefind.createIndex();
  checkErrors(created);

  const indexed = await created.index.addDirectory({
    path: fileURLToPath(new URL("../dist/", import.meta.url)),
  });
  checkErrors(indexed);

  const generated = await created.index.getFiles();
  checkErrors(generated);
  if (!generated.files?.length) throw new Error("Pagefind generated no files.");

  const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
  for (const directory of ["dist/pagefind", "public/pagefind"]) {
    const root = resolve(projectRoot, directory);
    if (!root.startsWith(projectRoot + sep)) {
      throw new Error(`Unexpected search index directory: ${root}`);
    }
    // Remove old fragments so deleted articles are removed from both indexes.
    await rm(root, { recursive: true, force: true });
    for (const file of generated.files) {
      const target = resolve(root, file.path);
      if (!target.startsWith(root + sep)) {
        throw new Error(`Unexpected Pagefind output path: ${file.path}`);
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
  }

  process.stdout.write(
    `Search index generated for ${indexed.page_count} pages (${generated.files.length} files).\n`
  );
} finally {
  await pagefind.close();
}
