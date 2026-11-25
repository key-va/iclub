// Shared by entity create/edit forms. The caller owns preview state and error text.
export async function prepareSquareImage(file: File, outputSize?: number): Promise<string> {
	const bitmap = await createImageBitmap(file);
	try {
		const side = Math.min(bitmap.width, bitmap.height);
		const size = outputSize ?? Math.min(512, side);
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		canvas
			.getContext('2d')!
			.drawImage(
				bitmap,
				(bitmap.width - side) / 2,
				(bitmap.height - side) / 2,
				side,
				side,
				0,
				0,
				size,
				size
			);
		return canvas.toDataURL('image/jpeg', 0.85);
	} finally {
		bitmap.close();
	}
}
