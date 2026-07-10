import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/tournament
export async function GET() {
  const session = await getServerSession(authOptions);
  let userId = session?.user?.id;

  if (!userId) {
    // Spectator mode: load the first tournament in the system
    const t = await prisma.vBTournament.findFirst();
    if (t) return NextResponse.json(t);
    return NextResponse.json({ started: false, bracketJson: null, activeMatchId: null, champion: null, gfResetId: null, setTargetPoints: 21, set3TargetPoints: 15 });
  }

  const t = await prisma.vBTournament.findUnique({ where: { userId } });
  return NextResponse.json(t ?? { started: false, bracketJson: null, activeMatchId: null, champion: null, gfResetId: null, setTargetPoints: 21, set3TargetPoints: 15 });
}

// PUT /api/tournament — upsert full tournament state
export async function PUT(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { started, bracketJson, activeMatchId, champion, gfResetId, setTargetPoints, set3TargetPoints } = body;

  const t = await prisma.vBTournament.upsert({
    where:  { userId: session.user.id },
    update: {
      started:      started      ?? false,
      bracketJson:  bracketJson  ?? null,
      activeMatchId: activeMatchId != null ? String(activeMatchId) : null,
      champion:     champion     ?? null,
      gfResetId:    gfResetId != null ? String(gfResetId) : null,
      ...(setTargetPoints !== undefined && { setTargetPoints }),
      ...(set3TargetPoints !== undefined && { set3TargetPoints }),
    },
    create: {
      userId:       session.user.id,
      started:      started      ?? false,
      bracketJson:  bracketJson  ?? null,
      activeMatchId: activeMatchId != null ? String(activeMatchId) : null,
      champion:     champion     ?? null,
      gfResetId:    gfResetId != null ? String(gfResetId) : null,
      setTargetPoints: setTargetPoints ?? 21,
      set3TargetPoints: set3TargetPoints ?? 15,
    },
  });
  return NextResponse.json(t);
}

// DELETE /api/tournament — reset
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.vBTournament.deleteMany({ where: { userId: session.user.id } });
  // Reset all team stats
  const teams = await prisma.vBTeam.findMany({ where: { userId: session.user.id } });
  await Promise.all(teams.map(t => prisma.vBTeam.update({
    where: { id: t.id },
    data:  { stats: { wins:0, losses:0, setsWon:0, setsLost:0, pointsFor:0, pointsAgainst:0 } },
  })));
  return NextResponse.json({ ok: true });
}
