import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

const PRESET_COLORS = ['#f97316', '#22d3ee', '#a78bfa', '#34d399', '#f87171', '#fbbf24', '#60a5fa', '#f472b6'];

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { count } = await req.json();
  const numTeams = parseInt(count, 10);
  if (isNaN(numTeams) || numTeams < 2 || numTeams > 8) {
    return NextResponse.json({ error: 'Invalid team count. Must be between 2 and 8.' }, { status: 400 });
  }

  // Clear existing teams & players first (Cascade delete handles players)
  await prisma.vBTeam.deleteMany({ where: { userId: session.user.id } });

  // Reset the tournament to unstarted state since teams changed
  await prisma.vBTournament.upsert({
    where: { userId: session.user.id },
    update: { started: false, bracketJson: null, activeMatchId: null, champion: null, gfResetId: null },
    create: { userId: session.user.id, started: false, bracketJson: null, activeMatchId: null, champion: null, gfResetId: null }
  });

  const createdTeams = [];

  // Generate new teams and rosters
  for (let i = 1; i <= numTeams; i++) {
    const teamColor = PRESET_COLORS[(i - 1) % PRESET_COLORS.length];
    const team = await prisma.vBTeam.create({
      data: {
        name: `Team ${i}`,
        color: teamColor,
        userId: session.user.id,
        players: {
          create: Array.from({ length: 5 }, (_, pi) => ({
            name: `Player ${pi + 1}`,
            number: String(pi + 1),
          }))
        }
      },
      include: { players: true }
    });
    createdTeams.push(team);
  }

  return NextResponse.json(createdTeams);
}
