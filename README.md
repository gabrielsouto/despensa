# despensa

PWA simples (ainda sem backend) para catalogar produtos da despensa direto do celular.

## Estado atual

- Front-end em HTML/CSS/JS puro.
- Scanner de código de barras usando `@zxing/library` com `getUserMedia`.
- Formulário com campos: código (auto preenchido), nome, peso, embalagem e foto.
- Persistência em IndexedDB ainda não implementada (somente log/alert para teste).

## Como testar

1. Publique os arquivos estáticos (por exemplo em `https://gbrl.com.br/despensa`).
2. Acesse a URL via HTTPS em um dispositivo com câmera e aceite as permissões.
3. Pressione **Iniciar leitura**, aponte a câmera para o código de barras e depois preencha o restante do formulário.

> Dica: para rodar localmente, sirva com qualquer servidor HTTP (ex.: `npx serve .`) e acesse via `https://localhost` para liberar a câmera.
