/**
 * A face small enough to travel as a record. A photo off a phone is megabytes; what a 24px circle
 * needs is a few kilobytes, so the picture is drawn onto a square canvas and read back as a JPEG
 * data URL — the same string the record carries for a picture Google keeps, so nothing that draws
 * an avatar has to know which kind it holds.
 */

const SIZE = 128;
const QUALITY = 0.82;

export class NotAnImageError extends Error {
  constructor(readonly file: File) {
    super(`"${file.name}" isn't a picture`);
    this.name = "NotAnImageError";
  }
}

export async function shrinkAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new NotAnImageError(file);
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser gave no canvas to draw on");
    // Cover, not contain: the middle square of a landscape photo, never a letterboxed one.
    const side = Math.min(bitmap.width, bitmap.height);
    const x = (bitmap.width - side) / 2;
    const y = (bitmap.height - side) / 2;
    context.drawImage(bitmap, x, y, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    bitmap.close();
  }
}

/** The one picture in a drop or a paste, or null when there was none. */
export function imageFileIn(transfer: DataTransfer | null): File | null {
  const files = [...(transfer?.files ?? [])];
  return files.find((file) => file.type.startsWith("image/")) ?? null;
}
