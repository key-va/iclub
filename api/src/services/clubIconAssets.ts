import sharp from "sharp";

const maxImageBytes = 2 * 1024 * 1024;

export async function clubIconAssets(clubId: string, image: unknown) {
    if (typeof image !== "string" || image.length > Math.ceil(maxImageBytes / 3) * 4 + 32)
        throw Error("image must be a Base64 512x512 JPEG of at most 2 MB");
    const encoded = image.replace(/^data:image\/jpe?g;base64,/i, "");
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
        throw Error("image must be valid Base64 JPEG data");
    const jpeg = Buffer.from(encoded, "base64");
    if (!jpeg.length || jpeg.length > maxImageBytes || jpeg.toString("base64") !== encoded)
        throw Error("image must be a Base64 512x512 JPEG of at most 2 MB");

    const source = sharp(jpeg, { limitInputPixels: 512 * 512, failOn: "warning" }).rotate();
    const metadata = await source.metadata();
    if (metadata.format !== "jpeg" || metadata.width !== 512 || metadata.height !== 512)
        throw Error("image must be a 512x512 JPEG");

    const variants = await Promise.all([180, 192, 512].map(async size => ({
        name: `${clubId}_${size}.png`,
        content: await source.clone().resize(size, size).png().toBuffer(),
    })));
    return [{ name: `${clubId}.jpg`, content: jpeg }, ...variants];
}
