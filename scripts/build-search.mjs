import { mkdir, writeFile } from "node:fs/promises";
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

  for (const directory of ["../dist/pagefind/", "../public/pagefind/"]) {
    const root = resolve(fileURLToPath(new URL(directory, import.meta.url)));
    for (const file of generated.files) {
      const target = resolve(root, file.path);
      if (!target.startsWith(root + sep)) {
        throw new Error(`Unexpected Pagefind output path: ${file.path}`);
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
  }

  console.log(`Search index generated for ${indexed.page_count} pages (${generated.files.length} files).`);
} finally {
  await pagefind.close();
}
