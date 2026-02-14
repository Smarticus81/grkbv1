import archiver from "archiver";
import { Writable } from "stream";

interface BundleFile {
  name: string;
  content: Buffer | string;
}

/**
 * Create a zip bundle from files.
 * Returns the zip as a Buffer.
 */
export async function createZipBundle(files: BundleFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writableStream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    const archive = archiver("zip", { zlib: { level: 9 } });

    writableStream.on("finish", () => {
      resolve(Buffer.concat(chunks));
    });

    archive.on("error", (err) => reject(err));
    archive.pipe(writableStream);

    for (const file of files) {
      archive.append(
        typeof file.content === "string"
          ? Buffer.from(file.content, "utf-8")
          : file.content,
        { name: file.name }
      );
    }

    archive.finalize();
  });
}
