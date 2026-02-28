import { NextResponse } from 'next/server';
import Jimp from 'jimp';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
        return NextResponse.json({ error: 'Missing image url parameter' }, { status: 400 });
    }

    // Define character map from dark to light
    const chars = '@%#*+=-:. ';

    try {
        const image = await Jimp.read(imageUrl);

        // Resize image to max width of 60 chars to fit standard DOS terminals
        image.resize(60, Jimp.AUTO);

        // Convert to grayscale
        image.greyscale();

        let asciiOutput = '';

        for (let y = 0; y < image.bitmap.height; y++) {
            for (let x = 0; x < image.bitmap.width; x++) {
                const hex = image.getPixelColor(x, y);
                const rgb = Jimp.intToRGBA(hex);

                // Map pixel intensity to character
                const charIndex = Math.floor((rgb.r / 255) * (chars.length - 1));

                // Use two characters per pixel horizontally to match typical non-square fonts
                asciiOutput += chars[charIndex].repeat(2);
            }
            asciiOutput += '\n';
        }

        return NextResponse.json({ success: true, ascii: asciiOutput });
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to process image', details: error.message }, { status: 500 });
    }
}
