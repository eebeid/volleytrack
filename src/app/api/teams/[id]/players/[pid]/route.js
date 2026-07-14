import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// DELETE /api/teams/[id]/players/[pid]
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the player's team belongs to the user
  const player = await prisma.vBPlayer.findFirst({
    where:   { id: params.pid, teamId: params.id },
    include: { team: true },
  });
  if (!player || player.team.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.vBPlayer.delete({ where: { id: params.pid } });
  return NextResponse.json({ ok: true });
}

// PUT /api/teams/[id]/players/[pid]
export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the player's team belongs to the user
  const player = await prisma.vBPlayer.findFirst({
    where:   { id: params.pid, teamId: params.id },
    include: { team: true },
  });
  if (!player || player.team.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { name, number, avatarDataUrl } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const updatedPlayer = await prisma.vBPlayer.update({
    where: { id: params.pid },
    data: {
      name: name.trim(),
      number: number || '',
      avatarDataUrl: avatarDataUrl || null,
    },
  });

  return NextResponse.json(updatedPlayer);
}
