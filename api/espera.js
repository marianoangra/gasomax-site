import { redis, verificaCaptcha } from './_lib.js';

// Lista de espera: guarda o contato e o veículo. Não reserva vaga de lote nem cria cobrança.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const telefone = String(b.telefone || '').replace(/\D/g, '');
    if (!['carro', 'moto', 'caminhao', 'barco', 'aviao'].includes(b.tipo) || !b.marca || !b.modelo || !b.ano || !b.nome || !/^\S+@\S+\.\S+$/.test(email) || telefone.length < 10)
      return res.status(400).json({ erro: 'Preencha nome, e-mail, WhatsApp e os dados do veículo.' });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (!(await verificaCaptcha(b['h-captcha-response'], ip)))
      return res.status(400).json({ erro: 'Não foi possível confirmar que você não é um robô. Tente de novo.' });

    const chave = `espera:${email}`;
    const novo = await redis.hsetnx(chave, 'criado', new Date().toISOString());
    await redis.hset(chave, {
      tipo: b.tipo, marca: String(b.marca).slice(0, 60), modelo: String(b.modelo).slice(0, 80), ano: String(b.ano).slice(0, 9),
      combustivel: String(b.combustivel || '').slice(0, 20), nome: String(b.nome).slice(0, 120), email,
      telefone: String(b.telefone || '').slice(0, 20), cidade: String(b.cidade || '').slice(0, 80), uf: String(b.uf || '').slice(0, 2)
    });
    await redis.sadd('gasomax:espera', email);
    res.json({ ok: true, novo: !!novo });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Não foi possível entrar na lista agora.' });
  }
}
