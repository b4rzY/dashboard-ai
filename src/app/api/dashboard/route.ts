import { getUser } from '@/lib/auth';
import { getAnalytics } from '@/services/analytics';
import { parseFilters } from '@/services/filters';
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const input = new URL(request.url);
  try {
    const filters = parseFilters(Object.fromEntries(input.searchParams));
    return Response.json(await getAnalytics(filters, user.holdingId));
  } catch {
    return Response.json({ error: 'No se pudo consultar el dashboard' }, { status: 400 });
  }
}
