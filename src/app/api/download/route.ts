import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        }

        const headers = new Headers();
        headers.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            headers.set('Content-Length', contentLength);
        }

        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition) {
            headers.set('Content-Disposition', contentDisposition);
        }

        return new NextResponse(response.body, {
            status: 200,
            headers: headers
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
