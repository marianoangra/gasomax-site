// Lista marcas e modelos da Tabela FIPE (carros, motos e caminhões vendidos no Brasil).
// GET /api/veiculos?tipo=carro|moto|caminhao            -> marcas
// GET /api/veiculos?tipo=carro&marca=<id>               -> modelos da marca
// O resultado fica em cache na Vercel por 1 dia, para não sobrecarregar a API da FIPE.
const TIPOS = { carro: 'cars', moto: 'motorcycles', caminhao: 'trucks' };
const BASES = ['https://parallelum.com.br/fipe/api/v2', 'https://fipe.parallelum.com.br/api/v2'];

const normaliza = lista => (Array.isArray(lista) ? lista : lista?.modelos || [])
  .map(x => ({ id: String(x.code ?? x.codigo ?? ''), nome: String(x.name ?? x.nome ?? '') }))
  .filter(x => x.id && x.nome);

export default async function handler(req, res) {
  const tipo = TIPOS[req.query.tipo];
  const marca = String(req.query.marca || '');
  if (!tipo || (marca && !/^\d{1,6}$/.test(marca))) return res.status(400).json({ erro: 'Parâmetros inválidos.' });
  const path = marca ? `/${tipo}/brands/${marca}/models` : `/${tipo}/brands`;
  const headers = process.env.FIPE_TOKEN ? { 'X-Subscription-Token': process.env.FIPE_TOKEN } : {};
  for (const base of BASES) {
    try {
      const r = await fetch(base + path, { headers });
      if (!r.ok) continue;
      const itens = normaliza(await r.json());
      if (!itens.length) continue;
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
      return res.json(itens);
    } catch {}
  }
  res.status(502).json({ erro: 'Lista indisponível.' });
}
