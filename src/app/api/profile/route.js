import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/profile
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, avatarDataUrl: true },
  });
  return NextResponse.json(user);
}

// PUT /api/profile
export async function PUT(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, avatarDataUrl } = await req.json();
  const user = await prisma.user.update({
    where:  { id: session.user.id },
    data:   {
      ...(name          !== undefined && { name }),
      ...(avatarDataUrl !== undefined && { avatarDataUrl }),
    },
    select: { id: true, name: true, email: true, image: true, avatarDataUrl: true },
  });
  return NextResponse.json(user);
}
