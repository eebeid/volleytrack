import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/orders — get all orders (admin only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orders = await prisma.vBOrder.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(orders);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/orders — submit a new order (anyone can submit)
export async function POST(req) {
  try {
    const t = await prisma.vBTournament.findFirst();
    if (!t) return NextResponse.json({ error: 'No active tournament found' }, { status: 400 });
    const userId = t.userId;

    const { captainName, memberNumber, hamCount, turkeyCount, eggSaladCount, drinkPackages } = await req.json();
    if (!captainName?.trim() || !memberNumber?.trim()) {
      return NextResponse.json({ error: 'Captain Name and Member Number are required.' }, { status: 400 });
    }

    const order = await prisma.vBOrder.create({
      data: {
        userId,
        captainName: captainName.trim(),
        memberNumber: memberNumber.trim(),
        hamCount: Number(hamCount) || 0,
        turkeyCount: Number(turkeyCount) || 0,
        eggSaladCount: Number(eggSaladCount) || 0,
        drinkPackages: Number(drinkPackages) || 0,
      }
    });

    return NextResponse.json(order);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/orders — clear an order or multiple (admin only)
export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      await prisma.vBOrder.deleteMany({
        where: { id, userId: session.user.id }
      });
    } else {
      // Clear all orders
      await prisma.vBOrder.deleteMany({
        where: { userId: session.user.id }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
