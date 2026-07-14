import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/tournament/archive — load history
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    if (!userId) {
      // Spectator mode: load from the first tournament user in the system
      const t = await prisma.vBTournament.findFirst();
      if (!t) return NextResponse.json([]);
      userId = t.userId;
    }

    const archives = await prisma.vBTournamentArchive.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(archives);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/tournament/archive — add snapshot
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, bracketJson, championName, championColor, championAvatar, standingsJson } = body;

    const archive = await prisma.vBTournamentArchive.create({
      data: {
        userId: session.user.id,
        name: name || `Tournament (${new Date().toLocaleDateString()})`,
        bracketJson,
        championName,
        championColor: championColor || '#e2c9a3',
        championAvatar,
        standingsJson,
      }
    });

    return NextResponse.json(archive);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/tournament/archive — delete entry
export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    await prisma.vBTournamentArchive.deleteMany({
      where: { id, userId: session.user.id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
