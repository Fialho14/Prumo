# Prumo Local

> This is the complete operational guide for the SQLite edition of Prumo. The application interface and commands are currently in Portuguese; this guide deliberately preserves that detail.

## Guia operacional

O Prumo é um tracker pessoal de património: mostra quanto dinheiro existe, onde está e como evoluiu. Corre apenas neste Mac, guarda montantes em cêntimos numa base de dados SQLite e não precisa de conta, cloud, analytics ou serviços externos.

Na visão geral, o gráfico de evolução soma por omissão todas as categorias exceto investimento e poupança. Usa o botão de categorias junto aos períodos para escolher exatamente o que entra na linha; toda a estatística do gráfico acompanha essa seleção.

Para avaliar uma compra grande sem alterar dados, abre `⌘ K` e escolhe **Simular uma compra grande**. O cenário começa apenas com categorias do tipo disponível, permite incluir outras fontes e mostra quanto sai de cada uma, o défice ou património restante e o capital protegido. A simulação existe apenas na página: não cria snapshots, não escreve na base de dados e é descartada ao sair ou recarregar.

## Instalação rápida

### Requisitos

- macOS;
- [Node.js](https://nodejs.org/) 22 ou superior, que já inclui `npm`;
- o volume privado montado, se a base de dados ficar num volume encriptado.

Confirma a versão instalada:

```sh
node --version
npm --version
```

O caminho mais simples não requer `npm install` dentro do projeto. O launcher instala as dependências e guarda a compilação fora do volume privado.

```sh
cd "/caminho/para/prumo-financas"
npm run finance
```

Na primeira execução pode ser necessário acesso à Internet apenas para descarregar as dependências de desenvolvimento. A aplicação e os dados financeiros não são enviados para a Internet. Depois de preparada, a aplicação funciona localmente em:

```text
http://127.0.0.1:3000
```

O servidor faz bind explícito a `127.0.0.1`; não escuta automaticamente na rede local. Usa `Ctrl+C` no Terminal para o parar.

## Abrir com duplo clique

O ficheiro `start-finance.command` verifica o ambiente, inicia o servidor, espera pela resposta local e abre o browser:

```sh
cd "/caminho/para/prumo-financas"
chmod +x start-finance.command
open -R start-finance.command
```

No Finder, faz duplo clique em `start-finance.command`. Mantém a janela do Terminal aberta enquanto usas o Prumo. Se o volume privado não estiver montado, a janela mostra uma mensagem útil e nenhuma base de dados alternativa é criada.

## Onde ficam os ficheiros

Há uma separação deliberada entre dados privados e ficheiros grandes de execução:

| Conteúdo | Localização por omissão | Contém dados financeiros? |
| --- | --- | --- |
| Base de dados de desenvolvimento | `data/finance.db` dentro do projeto | Sim |
| Base de dados privada configurada | valor de `FINANCE_DB_PATH` | Sim |
| Backups locais | pasta `backups` ao lado da base de dados | Sim |
| Dependências e build | `~/Library/Application Support/Prumo/runtime` | Não |
| Preferências de tema/privacidade | armazenamento local do browser | Não contém o histórico financeiro |

`node_modules` e `.next` no projeto são links simbólicos para o runtime externo. Assim, mesmo que o projeto esteja num volume pequeno, centenas de megabytes de dependências e cache ficam no disco principal do Mac. Para escolher outro local, configura `PRUMO_RUNTIME_DIR` com um caminho absoluto.

## Configurar um volume encriptado

O Prumo não recebe nem guarda a password do volume. Desbloqueia o volume no macOS e cria apenas as pastas onde queres guardar os dados:

```sh
mkdir -p "/Volumes/NOME_DO_DISCO/Financas/backups"
cd "/caminho/para/prumo-financas"
cp .env.example .env.local
open -e .env.local
```

Em `.env.local`, configura caminhos absolutos (as aspas são importantes quando existem espaços):

```dotenv
FINANCE_DB_PATH="/Volumes/NOME_DO_DISCO/Financas/finance.db"
FINANCE_BACKUP_PATH="/Volumes/NOME_DO_DISCO/Financas/backups"
```

Reinicia o servidor depois de alterar `.env.local`.

Regras de segurança do caminho:

- o diretório pai da base de dados tem de existir;
- uma base configurada que ainda não existe só é criada depois de confirmares **Inicializar neste caminho**;
- se o volume estiver desmontado, o Prumo mostra “Base de dados privada não disponível”;
- nesse caso, não há fallback para `data/finance.db` e não é criada uma base vazia noutro sítio;
- se `FINANCE_DB_PATH` não estiver definido, `data/finance.db` é usado de forma explícita para desenvolvimento local.

Não guardes a password do volume em `.env.local`. A proteção real vem da encriptação e bloqueio do volume pelo macOS; o Privacy Mode da interface serve apenas para ocultar números no ecrã.

## Primeira execução

1. Inicia com `npm run finance` ou com duplo clique no launcher.
2. Se configuraste um ficheiro novo, confirma **Inicializar neste caminho**.
3. Escolhe importar Excel/CSV, explorar dados fictícios ou começar do zero.

O onboarding é mostrado apenas numa base vazia. Os dados de demonstração ficam marcados como `demo`, aparecem numa faixa persistente e são só de leitura. Antes de registar ou importar dados reais tens de escolher explicitamente **Apagar demo e começar** ou **Manter como base pessoal**; nunca são misturados silenciosamente.

## Migrations e dados iniciais

As migrations correm automaticamente ao abrir uma base existente. Quando há uma alteração de schema numa base já inicializada, o Prumo cria primeiro uma cópia SQLite verificada na pasta `backups` ao lado da base.

Também podes executar as migrations explicitamente:

```sh
cd "/caminho/para/prumo-financas"
npm run db:migrate
```

Existe um seed exclusivamente fictício para desenvolvimento visual. É deliberadamente recusado se já existirem categorias ou snapshots:

```sh
npm run db:seed:demo
```

O histórico pessoal nunca faz parte do repositório. O seed `demo` serve apenas para desenvolvimento e testes; não o executes numa base que já começaste a atualizar.

## Importar Excel ou CSV

Abre **Definições → Importar Excel ou CSV**. O fluxo aceita `.xlsx` e CSV UTF-8 até 10 MB e não escreve nada antes da confirmação.

1. Escolhe o ficheiro e, num Excel com várias folhas, a folha correta.
2. Confirma a coluna de data e o mapeamento de cada coluna para uma categoria existente ou nova.
3. Revê a pré-visualização, linhas inválidas, duplicados exatos e conflitos de data.
4. Só depois confirma a importação.

Um formato simples funciona bem:

```csv
Data;Conta corrente;Reserva;Investimentos;Fundo de emergência;Nota
15/03/2026;325,50;500,00;800,00;950,25;Exemplo fictício
```

Duplicados exatos são ignorados. Um snapshot diferente numa data já usada é assinalado e exige confirmação explícita; nunca é criado silenciosamente. Mantém o ficheiro selecionado até concluir, porque o Prumo confirma o hash do ficheiro e do mapeamento entre a pré-visualização e a importação.

## Backups e exportação

Abre **Definições → Backups e exportação → Gerir backups**. Existem três saídas complementares:

- **Criar backup** escreve um JSON completo, versionado e com checksum SHA-256 na pasta de backups;
- **Descarregar JSON** cria uma cópia completa e portável no browser;
- **Descarregar CSV** exporta todos os snapshots numa tabela UTF-8 compatível com Excel.

Sem `FINANCE_BACKUP_PATH`, a pasta usada é `backups` ao lado de `finance.db`. Os ficheiros locais têm nomes como:

```text
finance-backup-20260824-010000Z.json
```

O ficheiro é escrito de forma atómica, relido e validado antes de ser apresentado como concluído. A retenção automática conserva os 30 backups JSON mais recentes reconhecidos. Edições e eliminações de snapshots criam uma cópia de segurança antes da alteração.

### Backup automático local

Ativa **Backup automático** na página de backups. A ativação só fica concluída depois de o primeiro ficheiro ter sido escrito e verificado. Depois disso, uma alteração ao património cria um novo backup quando passaram pelo menos 20 horas desde a última cópia bem-sucedida. Se uma tentativa falhar, o snapshot mantém-se guardado e a interface assinala que o backup precisa de atenção.

Um backup no mesmo volume protege contra alterações acidentais, mas não contra a perda física desse volume. Para redundância sem cloud, aponta `FINANCE_BACKUP_PATH` para um segundo volume local também encriptado.

### Restaurar

Em **Restaurar backup**, escolhe um JSON criado pelo Prumo. Antes da substituição, a aplicação:

1. valida formato, versão, limites e checksum;
2. mostra quantas categorias e snapshots serão restaurados e o intervalo de datas;
3. exige confirmação explícita;
4. cria e verifica um backup `pre-restore` dos dados atuais;
5. substitui os dados numa transação com integridade referencial.

Se a base SQLite atual estiver corrompida, o launcher abre na mesma o modo de recuperação. Nesse caso o Prumo valida primeiro o JSON numa nova base temporária, preserva intactos o ficheiro danificado e eventuais sidecars na pasta `backups` junto à base e só depois instala a cópia validada por troca atómica.

Prefere sempre o restauro JSON da interface a copiar um ficheiro SQLite enquanto o servidor está aberto. O JSON completo evita dependência do formato físico e o CSV mantém uma saída legível por outras ferramentas.

## Preparar ambiente de desenvolvimento

O mesmo mecanismo do launcher pode instalar dependências e criar os links externos sem iniciar o servidor:

```sh
cd "/caminho/para/prumo-financas"
npm run finance -- --prepare
```

Depois:

```sh
npm run dev
```

Verificações antes de aceitar uma alteração:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

O desenvolvimento e a produção escutam apenas em `127.0.0.1`. Não alteres o hostname para `0.0.0.0` num Mac que contém dados reais.

## Atualizar dependências

Cria primeiro um backup JSON e trabalha com o servidor parado. Depois prepara o runtime, vê o que está desatualizado e atualiza pacotes de forma deliberada:

```sh
cd "/caminho/para/prumo-financas"
npm run finance -- --prepare
npm outdated
npm install NOME_DO_PACOTE@latest
npm run typecheck
npm run lint
npm run test
npm run build
```

Revê sempre `package.json` e `package-lock.json`; não faças atualizações automáticas de major versions sem ler as respetivas notas de migração. O pacote `xlsx` usa a distribuição oficial indicada diretamente em `package.json`, por isso não o substituas pela versão antiga do registo npm. No arranque seguinte, `npm run finance` deteta a alteração do lockfile, sincroniza o runtime externo e recompila.

## Iniciar automaticamente no macOS

A opção mais transparente é adicionar `start-finance.command` aos Itens de Início de Sessão:

1. executa uma vez `chmod +x start-finance.command`;
2. abre **Definições do Sistema → Geral → Itens de Início de Sessão**;
3. em **Abrir ao iniciar sessão**, carrega em `+` e escolhe `start-finance.command`.

O volume encriptado tem de estar desbloqueado antes de o launcher arrancar. Se o macOS ainda não o tiver montado, o Prumo termina sem criar outra base; desbloqueia o volume e abre novamente o launcher. Esta configuração não instala um daemon e pode ser removida a qualquer momento nos Itens de Início de Sessão.

## Resolução de problemas

### “Base de dados privada não disponível”

Confirma o nome real do volume e os diretórios:

```sh
ls -ld "/Volumes/NOME_DO_DISCO"
ls -ld "/Volumes/NOME_DO_DISCO/Financas"
```

Depois confirma que `FINANCE_DB_PATH` em `.env.local` usa exatamente esse nome, desbloqueia o volume e recarrega a página.

### A porta 3000 já está ocupada

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Para o processo que reconheces e volta a executar `npm run finance`. O launcher só reutiliza a porta se `/api/health` responder como uma instância válida do Prumo.

### `node_modules` ou `.next` ocupa espaço no volume

O launcher espera links simbólicos. Se encontrar um diretório real, para com uma mensagem em vez de o apagar. Com o servidor parado, move esse diretório para fora do volume (ou para o Lixo depois de confirmares o conteúdo) e executa novamente:

```sh
npm run finance -- --prepare
```

### O launcher não encontra `npm`

Instala Node.js 22 ou superior, fecha e volta a abrir o Terminal e confirma `node --version`. Se usas Homebrew ou um gestor de versões, garante que a sua inicialização está no ficheiro de shell carregado pelo Terminal.

## Privacidade e segurança local

- a base de dados e os backups permanecem nos caminhos locais escolhidos;
- não existe login externo, telemetria ou analytics;
- não existem integrações bancárias nem cotações online;
- nenhuma informação financeira é escrita deliberadamente nos logs do servidor;
- `Privacy Mode` (`⌘⇧P`) oculta montantes no ecrã, mas não substitui a encriptação do volume;
- o servidor aceita apenas hosts/origens locais e envia cabeçalhos de segurança;
- montantes são guardados como inteiros em cêntimos e a base ativa chaves estrangeiras, verificação de integridade e escrita SQLite durável.

O princípio operacional é simples: desbloqueia o volume, abre o Prumo, atualiza o património e volta a bloquear o volume quando terminares.
