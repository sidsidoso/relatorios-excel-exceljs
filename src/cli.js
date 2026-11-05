#!/usr/bin/env node
import { executar } from './app.js';

// Carrega o .env, se existir (Node >= 20.12); variáveis já definidas no ambiente prevalecem
try {
  process.loadEnvFile();
} catch {
  // sem .env: segue com os padrões
}

process.exitCode = await executar(process.argv.slice(2));
