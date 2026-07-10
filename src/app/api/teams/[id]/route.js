import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

async function owned(teamId, userId) {
  return prisma.vBTeam.findFirst({ where: { id: teamId, userId } });
}

// PUT /api/teams/[id] — update team (name, color, logo, stats)
export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const team = await owned(params.id, session.user.id);
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.vBTeam.update({
    where: { id: params.id },
    data:  {
      ...(body.name          !== undefined && { name:          body.name }),
      ...(body.color         !== undefined && { color:         body.color }),
      ...(body.avatarDataUrl !== undefined && { avatarDataUrl: body.avatarDataUrl }),
      ...(body.stats         !== undefined && { stats:         body.stats }),
    },
    include: { players: true },
  });
  return NextResponse.json(updated);
}

// DELETE /api/teams/[id]
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const team = await owned(params.id, session.user.id);
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.vBTeam.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
