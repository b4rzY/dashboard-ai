import { getUser } from '@/lib/auth';
import { getTransactions } from '@/services/analytics';
import { parseFilters } from '@/services/filters';
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  try {
    return Response.json(
      await getTransactions(
        parseFilters(Object.fromEntries(new URL(request.url).searchParams)),
        user.holdingId,
      ),
    );
  } catch {
    return Response.json({ error: 'Consulta inválida' }, { status: 400 });
  }
}
