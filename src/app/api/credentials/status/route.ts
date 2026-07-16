import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'ssh') {
    return NextResponse.json({ status: 'ok', details: 'SSH backend reachable' });
  }

  // Handle other types as needed
  return NextResponse.json({ status: 'unknown' }, { status: 404 });
}
