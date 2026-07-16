import { NextResponse } from 'next/server';

// Mock storage for SSH credentials
const SSH_DB: Record<string, any> = {
  'default-ssh': {
    id: 'default-ssh',
    label: 'default-ssh',
    username: 'admin',
    password: 'password123',
    providerType: 'ssh'
  }
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.type === 'ssh' && body.label) {
      const cred = SSH_DB[body.label];
      if (cred) {
        return NextResponse.json(cred);
      }
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
