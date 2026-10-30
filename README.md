# Seridóplast Cartazes · v1.1 🖨️

Editor web colaborativo de cartazes de preço, pronto para **GitHub Pages + Supabase**. Desenvolvido a partir dos dois exemplos fornecidos pela Seridóplast.

## Funcionalidades

- Login por e-mail e senha usando Supabase Auth; recuperação de senha.
- Modelos compartilhados e editáveis por qualquer usuário autenticado.
- Upload de fundo PNG/JPG/WEBP e **área de conteúdo arrastável e redimensionável**.
- Ajustes de fonte, tamanhos, cores e exibição do símbolo R$.
- **Fonte individual por cartaz**, sem alterar a fonte original do modelo (também disponível em lote).
- Produtos, preço antigo riscado, preço de venda e unidade/apresentação.
- Cadastro individual ou em lote, colando diretamente quatro colunas do Excel ou **abrindo um arquivo .xlsx** (CSV/TSV continuam funcionando).
- Biblioteca de cartazes compartilhada, pesquisa e seleção múltipla.
- PDF **A4 retrato (1 cartaz)** ou **A4 paisagem (2 cartazes A5 retrato)**, com repetição opcional do último.
- Biblioteca de fontes corporativas em TTF/OTF/WOFF/WOFF2.
- Interface responsiva com modo claro e escuro; novas logos oficiais adaptadas a cada tema e favicon com o símbolo enviado.
- Avisos de confirmação/erro (toasts) desaparecem automaticamente depois de 2 segundos; diálogos de confirmação de exclusão continuam exigindo decisão do usuário.
- A arte `public/modelo-seridoplast.jpg` já está inclusa.
- Modo demonstração temporário quando não existem variáveis do Supabase (não sincroniza dados).

## 1. Crie o projeto Supabase

1. Acesse https://supabase.com/dashboard e crie um projeto.
2. Abra **SQL Editor** e execute todo o conteúdo de `supabase/setup.sql` se estiver **criando o banco pela primeira vez**.
3. No painel **Project Settings > API Keys**, copie a **Project URL** e uma chave **publishable/anon** (pública). **NUNCA coloque `service_role` ou `secret` no Vite/GitHub Pages.**
4. Em **Authentication > URL Configuration**, defina o *Site URL* como `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/` (ou seu domínio) e adicione essa URL à lista de *Redirect URLs*. Inclua também `http://localhost:5173/**` se for usar localmente.
5. Em **Authentication > Users**, crie/convidem-se os colaboradores autorizados. **Desative novos cadastros públicos** em Authentication > Providers > Email (a nomenclatura da configuração pode variar); o app tem login, não cadastro público. Novos funcionários devem ser convidados pelo administrador.
6. Se usar recuperação de senha por e-mail, revise o envio de e-mails e o SMTP do projeto.

**Segurança:** as tabelas usam RLS e só são lidas por contas autenticadas; apenas o criador pode excluir. Todos os usuários autenticados podem *editar* modelos e cartazes. Os arquivos de arte e fontes estão em buckets **privados**, com links temporários assinados. URLs e chaves *publishable/anon* ficam públicas no navegador — isso é esperado; a proteção efetiva está nas políticas RLS. Não armazene informações pessoais sensíveis nos cartazes.

## ATENÇÃO — Atualização de uma instalação v1 já em uso

Se você **já instalou a versão anterior e tem cartazes, modelos e funcionários no Supabase**, NÃO crie outro projeto nem apague tabelas. Entre no Supabase → SQL Editor e execute **somente** o conteúdo de:

```text
supabase/migrations/002_fonte_por_cartaz.sql
```

Esse script adiciona uma coluna `font_id` opcional à tabela `posters`, preservando todos os registros existentes. É necessário para permitir fontes diferentes por cartaz. Execute a migração **antes de publicar a nova interface**. Os registros antigos continuarão usando a fonte do respectivo modelo.

Depois disso, envie/substitua os arquivos do repositório GitHub pelos da v1.1, inclusive as pastas `public`, `src`, `supabase`, `.github` e o `package.json`. **Não** é necessário refazer o login, os Secrets do GitHub nem alterar suas chaves do Supabase. A publicação será acionada ao fazer o commit na `main`.

## 2. Teste no computador

Instale [Node.js](https://nodejs.org/) v22 ou superior.

```bash
npm install
cp .env.example .env
```

No Windows (PowerShell), para criar o `.env`:

```powershell
Copy-Item .env.example .env
```

Preencha o `.env` com os valores reais:

```dotenv
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publicavel
```

Depois:

```bash
npm run dev
```

Abra `http://localhost:5173/`.

Se não preencher as variáveis, o app inicia em **modo demonstração**, com a arte original e um cartaz de exemplo, sem login real e **sem persistência de dados**.

## 3. Publique no GitHub Pages

1. Crie um **repositório GitHub** e envie os arquivos desta pasta, **incluindo** `.github/workflows/deploy.yml`.
2. Em **Settings > Secrets and variables > Actions > New repository secret**, cadastre:
   - `VITE_SUPABASE_URL`: URL completa do projeto Supabase.
   - `VITE_SUPABASE_ANON_KEY`: chave pública/anon do Supabase.
3. Em **Settings > Pages > Build and deployment > Source**, escolha **GitHub Actions**.
4. Faça um push na branch `main` (ou execute o workflow manualmente em Actions).
5. Abra o link publicado em `https://SEU-USUARIO.github.io/SEU-REPO/`.

O arquivo `vite.config.ts` usa `base: './'`, compatível com o subcaminho GitHub Pages.

> **O GitHub não armazena cartazes, usuários ou fontes enviados pelo site.** Apenas hospeda o app e a imagem de exemplo. O Supabase armazena os registros e os arquivos compartilhados.

## 4. Como usar

1. Entre com sua conta Supabase.
2. Vá a **Modelos > Criar modelo**. O exemplo da Seridóplast já aparece. Também pode enviar outra arte.
3. Na aba **Área**, arraste a borda vermelha para a região em branco e puxe o canto inferior direito para ajustar. Na aba **Prévia**, confirme o resultado com preços de exemplo. Salve o modelo para toda a equipe.
4. Em **Cartazes**, clique em **Novo cartaz** e cadastre nome, preço anterior (opcional), preço atual e unidade comercial; salve.
5. Para vários itens, use **Importar em lote**. Baixe a planilha de exemplo `exemplo-cartazes.xlsx`, preencha as colunas A a D, nessa ordem: **Produto | Preço De | Preço Por | Unidade**. Escolha **Importar Excel (.xlsx), CSV ou TSV** e selecione o arquivo; o sistema lê a primeira aba. Também é possível colar as quatro colunas do Excel diretamente no campo ou importar CSV/TSV. O modelo escolhido será aplicado a todos os itens do lote.
6. Selecione os cartazes e escolha **1 por A4** ou **2 por A4**. Baixe o PDF. Na impressão, escolha **A4, tamanho real/escala 100%, sem ajustar à página**, com orientação automática, e confira a prévia da impressora.
7. Em **Fontes**, adicione fontes licenciadas. Depois escolha a fonte no editor de modelos **ou no cadastro de cada cartaz**. Na opção padrão, o cartaz herda a fonte do modelo. No cadastro em lote também é possível escolher uma fonte para todos os itens.

### Exemplo para colar diretamente do Excel

```text
CRISTALCOPO COPO PS 150ML 100UN	99,90	78,75	CX C/ 25PC X 100UND
SACOLA NEWPLAST M	39,90	34,50	FARDO C/ 1000 UN
```

O cabeçalho pode ser colado também. Dados podem ser separados por tabulação ou ponto e vírgula. Em `.xlsx`, o sistema lê a **primeira aba** e as **quatro primeiras colunas**. O preço “De” pode ficar vazio. Cada lote suporta até **200 registros**; o arquivo Excel deve ter no máximo **8 MB**. Arquivos `.xls` antigos precisam ser salvos como `.xlsx`.

**Privacidade:** o arquivo Excel é lido localmente no navegador; somente os dados confirmados de cada cartaz são enviados para o Supabase ao clicar em Salvar.

## 5. Decisões técnicas e limitações

- **Proporção:** artes devem preferencialmente seguir o aspecto A4 vertical (~0,707), como 1447×2048 px. O app avisa quando a imagem diverge mais de 4% dessa proporção, pois imagens fora do formato serão adaptadas à página e podem distorcer.
- **PDF:** renderização a aproximadamente 200 dpi via Canvas, incorporada ao PDF com jsPDF. A resolução da imagem de origem limita a nitidez. Em A4 com 2 cartazes, cada um mede **148,5 × 210 mm** (A5).
- **Pasta dos arquivos:** `cartaz-artes` (imagens), `cartaz-fontes` (fontes). Ambos são privados; URLs de acesso são assinadas e temporárias.
- **Edição compartilhada:** alterações são gravadas para toda a equipe, mas **não há histórico de versões** nem resolução avançada de conflitos de edição simultânea; a última gravação prevalece.
- **Exclusões:** apenas criadores podem excluir registros. Modelos referenciados por cartazes não podem ser apagados. Ao excluir um registro, o arquivo de origem no Storage não é removido automaticamente para não quebrar históricos; pode ser limpo pelo administrador.
- **Quantidade:** a listagem inicial traz até **3.000 cartazes**; para operação maior, acrescente paginação no Supabase.
- **Fontes:** o navegador pode recusar arquivos incompatíveis/corrompidos; fontes instaladas ficam disponíveis enquanto o navegador recebe a permissão correta de acesso.
- **Permissões:** o SQL oferece leitura/edição compartilhada para qualquer usuário autenticado; se quiser permissões por filial, aprovação por gestor, trilha de auditoria ou histórico de versões, ajuste as políticas e o modelo de dados.
- **Custos:** GitHub Pages e Supabase têm condições e limites que podem variar; acompanhe uso de armazenamento, banco, banda e autenticação no Supabase.

## Estrutura do código

```text
├── .github/workflows/deploy.yml  # deploy automático do GitHub Pages
├── public/modelo-seridoplast.jpg # arte original enviada
├── public/favicon.svg          # símbolo original fornecido
├── public/logo-light.svg      # logo para interface clara
├── public/logo-dark.svg       # logo para interface escura
├── public/exemplo-cartazes.xlsx # planilha para colaboradores
├── src/App.tsx                    # autenticação e interfaces
├── src/render.ts                  # motor de renderização e PDF
├── src/components/PosterCanvas.tsx
├── src/components/ZoneEditor.tsx
├── src/styles.css                 # tema claro e escuro
├── src/supabase.ts                # cliente e links assinados
├── src/types.ts                   # dados e estilos
├── src/excel.ts                   # importação de arquivos Excel .xlsx
├── supabase/setup.sql            # tabelas, RLS e buckets
├── supabase/migrations/002_fonte_por_cartaz.sql # atualização de bancos existentes
├── .env.example
└── package.json
```

## Diagnóstico de problemas

- **Tela em demonstração:** faltam variáveis `VITE_SUPABASE_*` no build do GitHub (precisa executar o workflow novamente após adicionar os Secrets).
- **Falha ao entrar:** confirme que o usuário existe e está ativo/confirmado no Supabase Auth.
- **Banco com erro 42P01:** execute `supabase/setup.sql` no SQL Editor do projeto correto.
- **Storage RLS 403:** confira se executou a parte final do SQL de criação de buckets e políticas e se está autenticado.
- **Imagem/fonte não aparece:** verifique se os arquivos existem no bucket privado e tente atualizar a biblioteca (links temporários podem expirar).
- **Impressão cortada:** use a opção de tamanho real/100% e a impressora com área de impressão que suporte página A4. Impressoras sem impressão sem bordas podem deixar margens brancas; isso é limitação do equipamento.

---

Projeto inicial para uso interno da Seridóplast. O material de marca incluído deve ser utilizado conforme a autorização da empresa.

## Mudanças da versão 1.1

- Identidade visual atualizada com base no SVG do sistema e favicon próprio.
- Importação direta de `.xlsx` em lote, sem converter para CSV.
- Avisos de 2 segundos (não se aplica a confirmações de exclusão e mensagens do formulário de login).
- Fonte opcional individual, armazenada em `posters.font_id`, aplicada na prévia e no PDF.
- Seleção de fonte opcional para todo um lote de produtos.

### Verificação técnica

Nesta entrega foi possível verificar a sintaxe do código atualizado, examinar os recursos gráficos e gerar uma planilha Excel válida. **A compilação Vite completa não pôde ser executada neste ambiente** porque o download das dependências npm ficou indisponível. O workflow GitHub Actions é a validação definitiva da compilação e publicação; se aparecer erro, envie o log da etapa de build.
