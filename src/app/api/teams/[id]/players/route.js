import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// POST /api/teams/[id]/players — add player to team
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const team = await prisma.vBTeam.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { name, number, age, avatarDataUrl } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const player = await prisma.vBPlayer.create({
    data: { name: name.trim(), number: number || '', age: age ? Number(age) : null, avatarDataUrl: avatarDataUrl || null, teamId: params.id },
  });
  return NextResponse.json(player, { status: 201 });
}
