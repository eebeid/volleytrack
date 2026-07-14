import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

async function getUser(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user;
}

// GET /api/teams — fetch all teams (with players)
export async function GET() {
  const session = await getServerSession(authOptions);
  let userId = session?.user?.id;

  if (!userId) {
    // Spectator mode: load the teams of the first tournament in the system
    const t = await prisma.vBTournament.findFirst();
    if (t) userId = t.userId;
  }

  if (!userId) return NextResponse.json([]);

  const teams = await prisma.vBTeam.findMany({
    where:   { userId },
    include: { players: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(teams);
}

// POST /api/teams — create team
export async function POST(req) {
  const session = await getServerSession(authOptions);
  let userId = session?.user?.id;

  if (!userId) {
    const t = await prisma.vBTournament.findFirst();
    if (!t) return NextResponse.json({ error: 'No active tournament found' }, { status: 400 });
    userId = t.userId;
  }

  const isPastRegistrationDeadline = new Date() > new Date('2026-07-22T23:59:59');
  if (isPastRegistrationDeadline) {
    return NextResponse.json({ error: 'Registration closed on July 22, 2026' }, { status: 400 });
  }

  const body = await req.json();
  const { name, color, avatarDataUrl, players } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const count = await prisma.vBTeam.count({ where: { userId } });
  if (count >= 8) return NextResponse.json({ error: 'Maximum 8 teams' }, { status: 400 });

  const createData = {
    name: name.trim(),
    color: color || '#f97316',
    avatarDataUrl: avatarDataUrl || null,
    userId
  };

  if (players && Array.isArray(players) && players.length > 0) {
    createData.players = {
      create: players.map(p => ({
        name: p.name.trim(),
        age: p.age ? Number(p.age) : null,
        number: p.number || '',
        avatarDataUrl: p.avatarDataUrl || null,
      }))
    };
  }

  const team = await prisma.vBTeam.create({
    data: createData,
    include: { players: true },
  });
  return NextResponse.json(team, { status: 201 });
}

// DELETE /api/teams — delete all teams for logged-in user
export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.vBTeam.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
