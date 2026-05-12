import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import * as path from 'path';

function preprocessCsvPlugin(): Plugin {
  // Raw files can be named with project prefix (华歌尔_历史整体.csv) or without (小仙炖_历史整体.csv)
  // Match by suffix pattern
  const SUFFIX_MAP: Record<string, string> = {
    '_历史整体.csv': 'history.csv',
    '_实时商播.csv': 'live_creatives.csv',
    '_实时商笔.csv': 'shop_creatives.csv',
    '_笔记总表.csv': 'notes_table.csv',
    '笔记总表.csv': 'notes_table.csv',
    '_笔记标准.csv': 'note_standard.csv',
  };

  /** Find the raw file in dir that matches a suffix pattern */
  function findRawFile(dir: string, suffixes: string[]): { src: string; dst: string } | null {
    for (const suffix of suffixes) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith(suffix));
      if (files.length > 0) {
        return { src: path.join(dir, files[0]), dst: SUFFIX_MAP[suffix] };
      }
    }
    return null;
  }

  function bufferToUtf8(buf: Buffer): string {
    let text: string;
    // Try UTF-8 first
    const utf8 = buf.toString('utf-8');
    if (!utf8.includes('�')) {
      text = utf8;
    } else {
      // UTF-8 has replacement chars → try GB18030/GBK
      try { text = new TextDecoder('gb18030').decode(buf); }
      catch { try { text = new TextDecoder('gbk').decode(buf); }
      catch { text = utf8; } }
    }
    // Strip BOM
    return text.replace(/^﻿/, '');
  }

  return {
    name: 'preprocess-csv',
    configureServer(server) {
      server.middlewares.use('/api/preprocessCsv', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { projectId } = JSON.parse(body);
            if (!projectId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing projectId' }));
              return;
            }

            // Read projects config
            const configPath = path.resolve('public/projects/projects.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const project = config.projects.find((p: any) => p.id === projectId);

            if (!project || !project.rawPath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Project not found or missing rawPath' }));
              return;
            }

            const rawDir = path.resolve(project.rawPath);
            // URL path (/data/processed/) maps to filesystem (public/data/processed/)
            const procDir = path.resolve('public', project.path.replace(/^\//, '').replace(/\/$/, ''));

            // Ensure processed directory exists
            if (!fs.existsSync(procDir)) {
              fs.mkdirSync(procDir, { recursive: true });
            }

            const results: Record<string, number> = {};
            const errors: string[] = [];

            // Group suffixes by target file, try longer suffixes first
            const targets: { dst: string; suffixes: string[] }[] = [
              { dst: 'history.csv', suffixes: ['_历史整体.csv'] },
              { dst: 'live_creatives.csv', suffixes: ['_实时商播.csv'] },
              { dst: 'shop_creatives.csv', suffixes: ['_实时商笔.csv'] },
              { dst: 'notes_table.csv', suffixes: ['_笔记总表.csv', '笔记总表.csv'] },
              { dst: 'note_standard.csv', suffixes: ['_笔记标准.csv'] },
            ];

            for (const { dst, suffixes } of targets) {
              const found = findRawFile(rawDir, suffixes);
              if (!found) {
                errors.push(`未找到: ${suffixes.join(' 或 ')}`);
                continue;
              }

              try {
                const buf = fs.readFileSync(found.src);
                const text = bufferToUtf8(buf);
                const lineCount = text.split('\n').filter(l => l.trim()).length;
                fs.writeFileSync(path.join(procDir, dst), text, 'utf-8');
                results[dst] = lineCount;
              } catch (e: any) {
                errors.push(`处理 ${path.basename(found.src)} 失败: ${e.message}`);
              }
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: errors.length === 0, results, errors }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), preprocessCsvPlugin()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chart': ['chart.js', 'react-chartjs-2'],
          'dayjs': ['dayjs'],
          'papaparse': ['papaparse'],
        },
      },
    },
  },
});
