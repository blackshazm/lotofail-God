
import { GoogleGenAI, Chat } from "@google/genai";
import { AnalysisData } from '../types';

export type GeminiChat = Chat;

const buildInitialPrompt = (analysisData: AnalysisData): string => {
  const hotNumbers = analysisData.freqData.slice(0, 5).map(d => d.numero).join(', ');
  const coldNumbers = analysisData.delayData
    .filter(d => parseFloat(d.zScore) > 1.5)
    .slice(0, 5)
    .map(d => `${d.numero} (Z-Score: ${d.zScore})`)
    .join('; ');
  const topClustersText = analysisData.clusterData
    .slice(0, 3)
    .map(c => `[${c.numeros.join(', ')}] (Tamanho: ${c.tamanho}, Ocorrências: ${c.ocorrencias})`)
    .join('; ');

  const topPairsText = analysisData.topPairs.slice(0, 3).map(p => `${p.par} (${p.ocorrencias} vezes)`).join('; ');
  const chiSquareText = analysisData.chiSquare.isUniform 
    ? `Aprovado (p-valor: ${analysisData.chiSquare.pValue}), a distribuição dos números parece uniforme.`
    : `Reprovado (p-valor: ${analysisData.chiSquare.pValue}), há indícios de desvio da uniformidade.`;

  return `
    Você é a "Deus IA", uma analista de loteria especialista e interativa. Sua missão é fornecer uma análise estratégica e depois conversar com o usuário para refinar a estratégia. Use um tom confiante, analítico e um pouco místico. Fale em Português do Brasil.

    **Resumo dos Dados da Análise de ${analysisData.totalDraws} Sorteios:**
    - **Números Mais Frequentes (Quentes):** ${hotNumbers}
    - **Números Mais Atrasados (Frios, Z-Score > 1.5):** ${coldNumbers || 'Nenhum significativamente atrasado'}
    - **Pares Mais Fortes:** ${topPairsText || 'Nenhum par com forte conexão'}
    - **Clusters Mais Relevantes:** ${topClustersText || 'Nenhum cluster forte detectado'}
    - **Validação Estatística (Qui-Quadrado):** ${chiSquareText}

    **Sua Análise Inicial (use Markdown):**
    1.  **Veredito Divino:** Um parágrafo de resumo sobre o estado atual do jogo.
    2.  **Foco Estratégico:** Com base nos dados, qual deveria ser o foco? Justifique sua recomendação.
    3.  **Conexões Cósmicas:** Destaque 2 ou 3 números ou grupos que chamam sua atenção.
    4.  **Sugestão Acionável:** Se notar uma tendência forte (ex: soma baixa, poucos pares), ofereça uma sugestão de ajuste de regra, estritamente no formato: \`[Sugerir ajuste: Mudar Soma para 175-205]\`.
    5.  **Convite à Conversa:** Termine com uma pergunta aberta, como "O que mais você gostaria de analisar?" ou "Gostaria de aprofundar em algum ponto?".

    A partir de agora, responda às perguntas do usuário de forma concisa e útil, sempre mantendo o contexto desta análise inicial.
  `;
};

export async function getGeminiInitialAnalysis(
  analysisData: AnalysisData, 
  updateStreamingText: (chat: Chat, chunk: string) => void
): Promise<void> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
    });
    const prompt = buildInitialPrompt(analysisData);
    
    const response = await chat.sendMessageStream({ message: prompt });
    
    for await (const chunk of response) {
      updateStreamingText(chat, chunk.text);
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    // This is a bit of a hack as we don't have the chat object here on error
    // A more robust solution might involve a different state management for errors
    // updateStreamingText(null, "Desculpe, a conexão com a divindade falhou.");
  }
}

export async function continueGeminiChat(
    chat: Chat,
    message: string,
    updateStreamingText: (chunk: string) => void
): Promise<void> {
    try {
        const response = await chat.sendMessageStream({ message });
        for await (const chunk of response) {
            updateStreamingText(chunk.text);
        }
    } catch(error) {
        console.error("Error continuing Gemini chat:", error);
        updateStreamingText("Ocorreu um erro. Por favor, tente novamente.");
    }
}
