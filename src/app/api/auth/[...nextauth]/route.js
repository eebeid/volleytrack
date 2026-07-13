import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import prisma from '@/lib/prisma';

const useSecureCookies = process.env.NODE_ENV === 'production';
const cookiePrefix    = useSecureCookies ? '__Secure-' : '';
const hostPrefix      = useSecureCookies ? '__Host-'   : '';
const sameSitePolicy  = useSecureCookies ? 'none' : 'lax';

export const authOptions = {
  cookies: {
    pkceCodeVerifier: {
      name: `${cookiePrefix}next-auth.pkce.code_verifier`,
      options: { httpOnly: true, sameSite: sameSitePolicy, path: '/', secure: useSecureCookies, maxAge: 900 },
    },
    state: {
      name: `${cookiePrefix}next-auth.state`,
      options: { httpOnly: true, sameSite: sameSitePolicy, path: '/', secure: useSecureCookies, maxAge: 900 },
    },
    nonce: {
      name: `${cookiePrefix}next-auth.nonce`,
      options: { httpOnly: true, sameSite: sameSitePolicy, path: '/', secure: useSecureCookies },
    },
    csrfToken: {
      name: `${hostPrefix}next-auth.csrf-token`,
      options: { httpOnly: true, sameSite: sameSitePolicy, path: '/', secure: useSecureCookies },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: { sameSite: sameSitePolicy, path: '/', secure: useSecureCookies },
    },
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: 'database',
    maxAge:   30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
