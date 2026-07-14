import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/photos — get all photos
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    if (!userId) {
      // Spectator mode: fetch from the owner of the active tournament
      const t = await prisma.vBTournament.findFirst();
      if (!t) return NextResponse.json([]);
      userId = t.userId;
    }

    const photos = await prisma.vBPhoto.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(photos);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/photos — upload a new photo (anyone can upload)
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    if (!userId) {
      // Spectator mode: associate photo with the owner of the active tournament
      const t = await prisma.vBTournament.findFirst();
      if (!t) return NextResponse.json({ error: 'No active tournament found' }, { status: 400 });
      userId = t.userId;
    }

    const { dataUrl, caption } = await req.json();
    if (!dataUrl) return NextResponse.json({ error: 'Image content required' }, { status: 400 });

    const photo = await prisma.vBPhoto.create({
      data: {
        userId,
        dataUrl,
        caption: caption || '',
      }
    });

    return NextResponse.json(photo);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/photos — delete a photo (admin only)
export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    await prisma.vBPhoto.deleteMany({
      where: { id, userId: session.user.id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
