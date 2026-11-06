import { redis, CONTADOR, HOLD_DIAS, MAX_POR_CPF, calcula, asaas, ambiente, verificaCaptcha, liberaVaga } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  let id, cpfKey, cpfOk = false, reservado = 0;
  try {
    ambiente(); // falha cedo se ASAAS_ENV estiver errado
    const b = req.body || {};
    const qtd = Math.min(Math.max(parseInt(b.qtd) || 1, 1), 10);
    const cpf = String(b.cpf || '').replace(/\D/g, '');
    const cep = String(b.cep || '').replace(/\D/g, '');
    if (!b.marca || !b.modelo || !b.ano || !b.nome || !b.email || cpf.length !== 11 || cep.length !== 8 || !b.rua || !b.numero || !b.cidade || !b.uf)
      return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios, incluindo marca, modelo e ano do veículo (CPF e CEP válidos).' });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (!(await verificaCaptcha(b['h-captcha-response'], ip)))
      return res.status(400).json({ erro: 'Não foi possível confirmar que você não é um robô. Tente de novo.' });

    // Limite de encomendas ativas por CPF (INCR atômico)
    cpfKey = `cpf:${cpf}`;
    const n = await redis.incr(cpfKey);
    cpfOk = true;
    if (n > MAX_POR_CPF) {
      await redis.decr(cpfKey); cpfOk = false;
      return res.status(429).json({ erro: `Cada CPF pode ter até ${MAX_POR_CPF} encomendas. Para quantidades maiores, fale com a gente.` });
    }

    // Reserva atômica: INCRBY garante que dois clientes nunca recebem a mesma posição
    const novo = await redis.incrby(CONTADOR, qtd);
    reservado = qtd;
    const total = calcula(novo - qtd, qtd);
    id = await redis.incr('gasomax:seq');
    const key = `pedido:${id}`;
    await redis.hset(key, {
      status: 'pendente', criado: new Date().toISOString(), qtd, total,
      marca: String(b.marca).slice(0, 60), modelo: String(b.modelo).slice(0, 80), ano: String(b.ano).slice(0, 9), combustivel: String(b.combustivel || '').slice(0, 20),
      nome: String(b.nome).slice(0, 120), cpf, email: String(b.email).slice(0, 120), telefone: String(b.telefone || '').slice(0, 20),
      endereco: `${b.rua}, ${b.numero} ${b.complemento || ''} - ${b.bairro || ''}, ${b.cidade}/${b.uf}, CEP ${cep}`.slice(0, 250)
    });
    await redis.sadd('gasomax:pedidos', String(id));

    const cliente = await asaas('/customers', {
      name: b.nome, cpfCnpj: cpf, email: b.email, mobilePhone: String(b.telefone || '').replace(/\D/g, ''),
      postalCode: cep, addressNumber: b.numero, externalReference: String(id)
    });
    const venc = new Date(Date.now() + HOLD_DIAS * 864e5).toISOString().slice(0, 10);
    const siteUrl = process.env.SITE_URL;
    const pgto = await asaas('/payments', {
      customer: cliente.id, billingType: 'UNDEFINED', value: total, dueDate: venc,
      description: `Encomenda Gasomax - ${qtd} un. para ${b.marca} ${b.modelo} ${b.ano} (frete incluso, envio em até 45 dias úteis)`.slice(0, 500),
      externalReference: String(id),
      callback: process.env.ASAAS_REDIRECT === '1' && siteUrl ? { successUrl: `${siteUrl}/obrigado.html`, autoRedirect: true } : undefined
    });
    await redis.hset(key, { asaas_payment: pgto.id, link: pgto.invoiceUrl });
    res.json({ ok: true, pedido: id, total, pagamento: pgto.invoiceUrl });
  } catch (e) {
    console.error(e);
    try {
      if (id) await liberaVaga(id, 'erro');
      else {
        if (reservado) await redis.decrby(CONTADOR, reservado);
        if (cpfOk) await redis.decr(cpfKey);
      }
    } catch {}
    res.status(500).json({ erro: e.message || 'Erro ao criar pedido.' });
  }
}
