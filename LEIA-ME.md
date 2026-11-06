# Gasomax – encomendas na Vercel

Estrutura: `public/` (site), `api/` (funções serverless), `package.json`.

## Subir
1. Crie um repositório no GitHub com esta pasta (o `.gitignore` já protege o `.env`) e importe em vercel.com/new.
   Framework: **Other**. Não precisa de build.
2. Na Vercel: Storage / Marketplace > **Upstash for Redis** > conectar ao projeto (cria as variáveis do banco sozinho).
3. Settings > Environment Variables: preencha as do `.env.example` (ASAAS_API_KEY, ASAAS_ENV, ASAAS_WEBHOOK_TOKEN, ADMIN_TOKEN, SITE_URL). Faça **Redeploy**.
4. Settings > Domains: adicione `www.gasomax.com.br` (e `gasomax.com.br`) e siga os registros DNS que a Vercel mostrar.
5. No Asaas: Integrações > Webhooks > URL `https://www.gasomax.com.br/api/webhook-asaas`, o mesmo ASAAS_WEBHOOK_TOKEN, eventos de cobrança (confirmada, recebida, vencida, removida, estornada).
6. Teste uma compra com `ASAAS_ENV=sandbox`. Quando estiver ok, troque para `producao` com a chave de produção e faça Redeploy.

## Pedidos
Baixe em CSV (marca, modelo, ano, endereço):
`curl -H "Authorization: Bearer SEU_ADMIN_TOKEN" https://www.gasomax.com.br/api/pedidos -o pedidos.csv`
O veículo também aparece na descrição de cada cobrança no Asaas.

## Notas
- Pedido não pago libera a vaga quando o Asaas avisa que venceu (3 dias).
- `ASAAS_REDIRECT=1` leva o cliente a /obrigado.html após pagar, mas o Asaas exige o site cadastrado na sua conta.
