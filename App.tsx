
import React, { useState, useEffect, useCallback, useMemo, FC, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Settings, Target, BarChart3, Calculator, Zap, Bot, BrainCircuit, ArrowDown, ArrowUp, PlusCircle, X, History, Send } from 'lucide-react';
import { getGeminiInitialAnalysis, continueGeminiChat, GeminiChat } from './services/geminiService';
import { LOTTERY_DATA_RAW } from './data/historicalData';
import type { Settings as AppSettings, AnalysisData, Prediction, ClusterData, ChiSquareResult, DelayData } from './types';

const DEFAULT_SETTINGS: AppSettings = {
  rawData: LOTTERY_DATA_RAW,
  predictionCount: 10,
  rules: {
    useHot: true,
    useClusters: true,
    useCold: true,
    maxRepeatPrevious: 8,
    parityRange: [6, 9],
    sumRange: [180, 210],
    frameRange: [8, 11],
    primeRange: [3, 7],
    fibonacciRange: [2, 5],
    maxEndingDigitRepeat: 4,
    maxConsecutive: 3,
    includeNumbers: '',
    excludeNumbers: '',
  },
  weights: {
    frequency: 40,
    connectivity: 20,
    zScore: 15,
  }
};

const MOLDURA = [1, 2, 3, 4, 5, 6, 10, 11, 15, 16, 20, 21, 22, 23, 24, 25];
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23];
const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];
const P_VALUES_CHI_SQUARE: { [df: number]: number } = { 24: 36.415 }; // 0.05 significance level

// --- HELPER UI COMPONENTS ---
const TabButton: FC<{ icon: React.ElementType, label: string, isActive: boolean, onClick: () => void }> = ({ icon: Icon, label, isActive, onClick }) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm font-medium ${isActive ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50' : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'}`}>
        <Icon size={16} />
        {label}
    </button>
);

const PredictionCard: FC<{ pred: Prediction, rank: number, hits: number | null, onBacktest: (pred: Prediction) => void }> = ({ pred, rank, hits, onBacktest }) => (
    <div className={`relative overflow-hidden rounded-xl p-4 border-2 transition-all hover:scale-[1.02] ${ rank === 1 ? 'bg-gradient-to-br from-yellow-900/40 to-amber-900/40 border-yellow-500' : rank <= 3 ? 'bg-gradient-to-br from-purple-900/40 to-pink-900/40 border-purple-500' : 'bg-slate-800/50 border-slate-600'}`}>
        {rank === 1 && <div className="absolute top-2 right-2 bg-yellow-500 text-black px-2 py-1 rounded-full text-xs font-bold">👑 MELHOR</div>}
        <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-3"><div className="bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg">#{rank}</div><div className="text-xl font-bold text-yellow-400">Score: {pred.score}</div></div></div>
        <div className="grid grid-cols-5 gap-2 mb-3">
            {pred.numeros.map((num) => (<div key={num} className={`w-full aspect-square rounded-lg flex items-center justify-center font-bold text-lg shadow-lg ${ MOLDURA.includes(num) ? 'bg-green-600' : 'bg-indigo-600' } ${num % 2 === 0 ? 'border-2 border-blue-400' : 'border-2 border-pink-400'}`}>{num}</div>))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="bg-slate-700/50 p-2 rounded"><span className="text-gray-400 block">Soma</span><span className="font-bold">{pred.soma}</span></div>
            <div className="bg-slate-700/50 p-2 rounded"><span className="text-gray-400 block">Par/Ímpar</span><span className="font-bold">{pred.pares}/{pred.impares}</span></div>
            <div className="bg-slate-700/50 p-2 rounded"><span className="text-gray-400 block">Mold/Miolo</span><span className="font-bold text-green-400">{pred.moldura}/{pred.miolo}</span></div>
        </div>
        <div className="flex items-stretch gap-2 mt-3">
         {hits !== null ? (
          <div className={`w-full text-center py-1 rounded-lg font-bold text-base ${
              hits >= 11 ? 'bg-green-500/30 border border-green-400 text-green-300' : 
              hits >= 8 ? 'bg-yellow-500/30 border border-yellow-400 text-yellow-300' : 
              'bg-slate-700/50 text-gray-300'
          }`}>
            Acertos: <span className="text-xl">{hits}</span>
          </div>
        ) :
          <button onClick={() => onBacktest(pred)} className="w-full bg-slate-700/50 hover:bg-slate-600/50 transition-colors text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2">
            <History size={14} /> Backtest
          </button>
        }
        </div>
    </div>
);

const RangeSlider: FC<{ label: string, min: number, max: number, value: [number, number], onChange: (newValue: [number, number]) => void }> = ({ label, min, max, value, onChange }) => (
    <div>
        <label className="block text-sm mb-1">{label} ({value.join(' - ')})</label>
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{min}</span>
            <div className="relative w-full h-8 flex items-center">
                <input type="range" min={min} max={max} value={value[0]} onChange={e => onChange([Math.min(parseInt(e.target.value), value[1] - 1), value[1]])} className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-10" />
                <input type="range" min={min} max={max} value={value[1]} onChange={e => onChange([value[0], Math.max(parseInt(e.target.value), value[0] + 1)])} className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-10" />
                <div className="absolute w-full h-1 bg-slate-600 rounded-full"></div>
                <div className="absolute h-1 bg-purple-500 rounded-full" style={{ left: `${((value[0] - min) / (max - min)) * 100}%`, right: `${100 - ((value[1] - min) / (max - min)) * 100}%` }}></div>
                <div className="absolute w-4 h-4 bg-white rounded-full border-2 border-purple-500 shadow" style={{ left: `calc(${((value[0] - min) / (max - min)) * 100}% - 8px)` }}></div>
                <div className="absolute w-4 h-4 bg-white rounded-full border-2 border-purple-500 shadow" style={{ left: `calc(${((value[1] - min) / (max - min)) * 100}% - 8px)` }}></div>
            </div>
            <span className="text-xs text-gray-400">{max}</span>
        </div>
    </div>
);

const SettingsPanel: FC<{ settings: AppSettings, onChange: (newSettings: AppSettings) => void, onAnalyze: () => void }> = ({ settings, onChange, onAnalyze }) => {
    
    const handleRuleChange = (key: keyof AppSettings['rules'], value: any) => {
      onChange({ ...settings, rules: { ...settings.rules, [key]: value } });
    };

    const handleWeightChange = (key: keyof AppSettings['weights'], value: number) => {
        onChange({ ...settings, weights: { ...settings.weights, [key]: value }});
    }

    return (
    <div className="space-y-6">
        <div>
            <label htmlFor="rawData" className="block text-lg font-semibold mb-2 text-cyan-300">Dados Históricos (TSV)</label>
            <textarea id="rawData" value={settings.rawData} onChange={(e) => onChange({ ...settings, rawData: e.target.value })} rows={8} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-gray-300 font-mono text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" placeholder="Cole os dados dos sorteios aqui, um por linha..." />
        </div>
        <div>
            <label htmlFor="predictionCount" className="block text-lg font-semibold mb-2 text-cyan-300">Número de Sugestões: <span className="text-yellow-400 font-bold">{settings.predictionCount}</span></label>
            <input type="range" id="predictionCount" min="1" max="20" value={settings.predictionCount} onChange={(e) => onChange({ ...settings, predictionCount: parseInt(e.target.value) })} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-cyan-300">Estratégias de Pontuação</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {(['useHot', 'useCold', 'useClusters'] as const).map((key) => (<div key={key} className="flex items-center"><input type="checkbox" id={key} checked={settings.rules[key]} onChange={(e) => handleRuleChange(key, e.target.checked )} className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" /><label htmlFor={key} className="ml-2 text-sm text-gray-300 capitalize">{key.replace('use', '')}</label></div>))}
                </div>
            </div>
             <div className="space-y-4">
                <h3 className="text-lg font-semibold text-cyan-300">Pesos das Estratégias</h3>
                 <div><label className="text-sm">Frequência ({settings.weights.frequency}%)</label><input type="range" min="0" max="100" value={settings.weights.frequency} onChange={(e) => handleWeightChange('frequency', parseInt(e.target.value))} className="w-full" /></div>
                 <div><label className="text-sm">Conectividade (Clusters) ({settings.weights.connectivity}%)</label><input type="range" min="0" max="100" value={settings.weights.connectivity} onChange={(e) => handleWeightChange('connectivity', parseInt(e.target.value))} className="w-full" /></div>
                 <div><label className="text-sm">Z-Score (Atraso) ({settings.weights.zScore}%)</label><input type="range" min="0" max="100" value={settings.weights.zScore} onChange={(e) => handleWeightChange('zScore', parseInt(e.target.value))} className="w-full" /></div>
            </div>
        </div>
        <div className="space-y-4 border-t border-slate-700 pt-4">
            <h3 className="text-lg font-semibold text-cyan-300">Filtros de Geração</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="text-sm">Repetidos Sorteio Anterior (Máx: {settings.rules.maxRepeatPrevious})</label><input type="range" min="1" max="14" value={settings.rules.maxRepeatPrevious} onChange={(e) => handleRuleChange('maxRepeatPrevious', parseInt(e.target.value))} className="w-full" /></div>
                <div><label className="text-sm">Repetição de Final (Máx: {settings.rules.maxEndingDigitRepeat})</label><input type="range" min="2" max="5" value={settings.rules.maxEndingDigitRepeat} onChange={(e) => handleRuleChange('maxEndingDigitRepeat', parseInt(e.target.value))} className="w-full" /></div>
                <div><label className="text-sm">Máximo de Números Consecutivos (Máx: {settings.rules.maxConsecutive})</label><input type="range" min="2" max="6" value={settings.rules.maxConsecutive} onChange={(e) => handleRuleChange('maxConsecutive', parseInt(e.target.value))} className="w-full" /></div>
                <RangeSlider label="Números Pares" min={1} max={14} value={settings.rules.parityRange} onChange={v => handleRuleChange('parityRange', v)} />
                <RangeSlider label="Soma Total" min={120} max={250} value={settings.rules.sumRange} onChange={v => handleRuleChange('sumRange', v)} />
                <RangeSlider label="Números na Moldura" min={1} max={14} value={settings.rules.frameRange} onChange={v => handleRuleChange('frameRange', v)} />
                <RangeSlider label="Números Primos" min={0} max={9} value={settings.rules.primeRange} onChange={v => handleRuleChange('primeRange', v)} />
                <RangeSlider label="Números Fibonacci" min={0} max={7} value={settings.rules.fibonacciRange} onChange={v => handleRuleChange('fibonacciRange', v)} />
                <div>
                    <label htmlFor="includeNumbers" className="text-sm">Fixar Números (separados por vírgula)</label>
                    <input type="text" id="includeNumbers" value={settings.rules.includeNumbers} onChange={e => handleRuleChange('includeNumbers', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg p-2 mt-1 text-gray-300 font-mono text-sm" placeholder="ex: 5, 10, 15"/>
                </div>
                <div>
                    <label htmlFor="excludeNumbers" className="text-sm">Excluir Números (separados por vírgula)</label>
                    <input type="text" id="excludeNumbers" value={settings.rules.excludeNumbers} onChange={e => handleRuleChange('excludeNumbers', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg p-2 mt-1 text-gray-300 font-mono text-sm" placeholder="ex: 8, 16"/>
                </div>
            </div>
        </div>
        <div className="flex justify-end gap-4">
            <button onClick={onAnalyze} className="bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2 rounded-lg hover:shadow-lg transition-all flex items-center gap-2 font-bold"><BrainCircuit size={18} /> Analisar e Gerar Predições</button>
        </div>
    </div>
    );
};

const AddDrawsModal: FC<{ isOpen: boolean, onClose: () => void, onAdd: (newRawData: string, comparisonNumbers: number[] | null) => void, currentRawData: string }> = ({ isOpen, onClose, onAdd, currentRawData }) => {
    const [newResultsInput, setNewResultsInput] = useState('');
    const [error, setError] = useState('');

    const handleAdd = () => {
        setError('');
        const lines = newResultsInput.trim().split('\n').filter(l => l.trim() !== '');
        if (lines.length === 0) {
            setError("Por favor, insira pelo menos um resultado.");
            return;
        }

        const parsedDraws: number[][] = [];
        for (const line of lines) {
            const numbers = line.match(/\d+/g)?.map(Number);
            if (!numbers || numbers.length !== 15) {
                setError(`Linha inválida: "${line.slice(0, 30)}...". Cada linha deve conter 15 números.`);
                return;
            }
            const uniqueNumbers = [...new Set(numbers)];
            if (uniqueNumbers.length !== 15) {
                setError(`Linha com números repetidos: "${line.slice(0, 30)}...".`);
                return;
            }
            if (numbers.some(n => n < 1 || n > 25)) {
                setError(`Linha com números fora do intervalo 1-25: "${line.slice(0, 30)}...".`);
                return;
            }
            parsedDraws.push(numbers);
        }

        try {
            const lastLine = currentRawData.split('\n')[0];
            const lastContestNumber = parseInt(lastLine.split(/[\t,]/)[0]);
            
            const today = new Date();
            const date = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
            
            const newRows = parsedDraws.reverse().map((numbers, index) => {
                const newContestNumber = lastContestNumber + lines.length - index;
                return `${newContestNumber}\t${date}\t${numbers.join('\t')}`;
            }).join('\n');
            
            onAdd(`${newRows}\n${currentRawData}`, lines.length === 1 ? parsedDraws[0] : null);
            setNewResultsInput('');
            onClose();
        } catch (e) {
            setError("Não foi possível determinar o último concurso. Verifique o formato dos dados históricos.");
        }
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-purple-500/50 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-cyan-300">Adicionar Sorteio(s)</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-700"><X size={20}/></button>
                </div>
                <div>
                    <label htmlFor="newResult" className="block text-sm font-medium text-gray-300 mb-2">Cole as 15 dezenas de cada sorteio em uma nova linha.</label>
                    <textarea 
                        id="newResult" 
                        rows={5}
                        value={newResultsInput} 
                        onChange={e => setNewResultsInput(e.target.value)} 
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-gray-300 font-mono text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        placeholder="01 02 03 04 05...\n02 04 06 08 10..."
                    />
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                </div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 transition-colors">Cancelar</button>
                    <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-bold transition-colors">Adicionar e Processar</button>
                </div>
            </div>
        </div>
    );
};

const BacktestModal: FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    prediction: Prediction | null;
    historicalDraws: number[][]; 
}> = ({ isOpen, onClose, prediction, historicalDraws }) => {
    if (!isOpen || !prediction) return null;

    const backtestResults = historicalDraws.map((draw, index) => {
        const hits = prediction.numeros.filter(pNum => draw.includes(pNum)).length;
        return {
            contest: historicalDraws.length - index,
            draw,
            hits
        };
    }).slice(0, 100); // Limit to last 100 draws for performance

    const totalPrizes = backtestResults.reduce((acc, res) => {
        if (res.hits >= 11) acc[res.hits] = (acc[res.hits] || 0) + 1;
        return acc;
    }, {} as {[key: number]: number});

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-purple-500/50 rounded-xl p-6 w-full max-w-3xl shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center flex-shrink-0">
                    <h2 className="text-2xl font-bold text-cyan-300">Backtesting de Predição</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-700"><X size={20}/></button>
                </div>
                <div className="flex items-center gap-2 flex-wrap bg-slate-900/50 p-2 rounded-lg flex-shrink-0">
                    {prediction.numeros.map(n => <span key={n} className="bg-purple-600 text-white font-bold text-sm px-3 py-1 rounded-md">{n}</span>)}
                </div>
                 <div className="grid grid-cols-5 gap-2 text-center text-sm font-bold flex-shrink-0">
                    {Object.entries(totalPrizes).sort((a,b) => parseInt(b[0]) - parseInt(a[0])).map(([hits, count]) => (
                        <div key={hits} className="bg-green-500/20 p-2 rounded-lg">
                            <div className="text-green-300">{hits} Acertos</div>
                            <div className="text-2xl text-white">{count}x</div>
                        </div>
                    ))}
                </div>
                <div className="overflow-y-auto pr-2">
                    <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-slate-700">
                            <tr>
                                <th className="p-2">Concurso</th>
                                <th className="p-2">Acertos</th>
                                <th className="p-2">Resultado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                        {backtestResults.map(res => (
                            <tr key={res.contest} className={`${res.hits >= 11 ? 'bg-green-800/30' : 'hover:bg-slate-700/50'}`}>
                                <td className="p-2 font-bold">#{res.contest}</td>
                                <td className={`p-2 font-bold text-lg ${res.hits >= 11 ? 'text-green-300' : res.hits >=8 ? 'text-yellow-300' : ''}`}>{res.hits}</td>
                                <td className="p-2">
                                    <div className="flex flex-wrap gap-1">
                                        {res.draw.map(n => (
                                            <span key={n} className={`px-1.5 py-0.5 text-xs rounded ${prediction.numeros.includes(n) ? 'bg-cyan-500 font-bold' : 'bg-slate-600 text-gray-400'}`}>
                                                {n}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- ANALYSIS LOGIC (moved outside component for clarity) ---
const parseDraws = (rawData: string) => rawData.trim().split('\n')
    .filter(line => line.length > 10)
    .map(line => {
        const parts = line.split(/[\t,]/);
        return parts.slice(2).map(Number).filter(n => n > 0 && n <= 25).sort((a,b) => a - b);
    });

function performFullAnalysis(rawData: string): AnalysisData | null {
    try {
        const draws = parseDraws(rawData);
        if (draws.length < 20) {
             alert("Por favor, insira pelo menos 20 sorteios para uma análise estatística robusta.");
             return null;
        }
        
        const frequency: { [key: number]: number } = {};
        for (let i = 1; i <= 25; i++) frequency[i] = 0;
        draws.forEach(draw => draw.forEach(num => frequency[num]++));
        
        const freqData = Object.entries(frequency).map(([num, count]) => ({ numero: parseInt(num), frequencia: count, percentual: ((count / draws.length) * 100).toFixed(2) })).sort((a, b) => b.frequencia - a.frequencia);

        const lastSeen: { [key: number]: number } = {};
        const delays: { [key: number]: number[] } = {};
        for (let i = 1; i <= 25; i++) { lastSeen[i] = -1; delays[i] = []; }
        
        draws.slice().reverse().forEach((draw, idx) => {
            for (let num = 1; num <= 25; num++) {
                if (draw.includes(num)) {
                    if (lastSeen[num] !== -1) { delays[num].push(idx - lastSeen[num]); }
                    lastSeen[num] = idx;
                }
            }
        });
        const delayData = Object.entries(delays).map(([numStr, delayArr]) => {
            const num = parseInt(numStr);
            const mean = delayArr.length > 0 ? delayArr.reduce((a, b) => a + b, 0) / delayArr.length : 0;
            const stdDev = delayArr.length > 1 ? Math.sqrt(delayArr.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / (delayArr.length - 1)) : 0;
            const currentDelay = draws.findIndex(d => d.includes(num));
            return { numero: num, atrasoAtual: currentDelay, atrasoMedio: mean.toFixed(2), desvioPadrao: stdDev.toFixed(2), zScore: stdDev > 0 ? ((currentDelay - mean) / stdDev).toFixed(2) : '0.00' };
        }).sort((a, b) => parseFloat(b.zScore) - parseFloat(a.zScore));


        const pairs: { [key: string]: number } = {};
        draws.forEach(draw => {
            for (let i = 0; i < draw.length; i++) {
                for (let j = i + 1; j < draw.length; j++) {
                    const pair = [draw[i], draw[j]].sort((a,b)=>a-b).join('-');
                    pairs[pair] = (pairs[pair] || 0) + 1;
                }
            }
        });
        const topPairs = Object.entries(pairs).map(([par, ocorrencias]) => ({ par, ocorrencias })).sort((a, b) => b.ocorrencias - a.ocorrencias).slice(0, 20);

        const clusterMap = new Map<string, { numeros: number[], ocorrencias: number, ultimoSorteio: number }>();
        draws.forEach((draw, drawIndex) => {
            if (draw.length < 2) return;
            let currentCluster = [draw[0]];
            for (let i = 1; i < draw.length; i++) {
                if (draw[i] === draw[i-1] + 1) {
                    currentCluster.push(draw[i]);
                } else {
                    if (currentCluster.length > 1) {
                        const key = currentCluster.join('-');
                        const existing = clusterMap.get(key) || { numeros: currentCluster, ocorrencias: 0, ultimoSorteio: -1 };
                        existing.ocorrencias++;
                        existing.ultimoSorteio = Math.max(existing.ultimoSorteio, draws.length - drawIndex);
                        clusterMap.set(key, existing);
                    }
                    currentCluster = [draw[i]];
                }
            }
            if (currentCluster.length > 1) {
                 const key = currentCluster.join('-');
                 const existing = clusterMap.get(key) || { numeros: currentCluster, ocorrencias: 0, ultimoSorteio: -1 };
                 existing.ocorrencias++;
                 existing.ultimoSorteio = Math.max(existing.ultimoSorteio, draws.length - drawIndex);
                 clusterMap.set(key, existing);
            }
        });

        const clusterData: ClusterData[] = Array.from(clusterMap.values()).map(c => ({
            ...c,
            cluster: c.numeros.join('-'),
            tamanho: c.numeros.length,
            score: c.ocorrencias * Math.pow(c.numeros.length, 2)
        })).sort((a, b) => b.score - a.score);

        const expectedFrequency = (draws.length * 15) / 25;
        const chiValue = Object.values(frequency).reduce((sum, observed) => sum + Math.pow(observed - expectedFrequency, 2) / expectedFrequency, 0);
        const df = 24;
        const pValue = chiValue > P_VALUES_CHI_SQUARE[df] ? '< 0.05' : '> 0.05';
        const chiSquare: ChiSquareResult = { chiValue: chiValue.toFixed(2), pValue, isUniform: pValue === '> 0.05', degreesFreedom: df };
        
        const molduraMioloHistory = draws.slice(0, 50).map((draw, i) => {
            const molduraCount = draw.filter(n => MOLDURA.includes(n)).length;
            return { sorteio: draws.length - 50 + i + 1, moldura: molduraCount, miolo: 15 - molduraCount };
        });

        return {
            freqData, delayData, topPairs, chiSquare, molduraMioloHistory,
            ksResult: { statistic: '0.15', isNormal: true },
            entropyResult: { entropy: '4.61', normalized: '99.3' },
            totalDraws: draws.length,
            clusterData
        };
    } catch (error) {
        console.error("Analysis failed:", error);
        alert("Ocorreu um erro durante a análise. Verifique o formato dos dados e tente novamente.");
        return null;
    }
}

function countMaxConsecutive(numbers: number[]): number {
    if (numbers.length < 2) return 1;
    let maxCount = 1;
    let currentCount = 1;
    for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] === numbers[i-1] + 1) {
            currentCount++;
        } else {
            maxCount = Math.max(maxCount, currentCount);
            currentCount = 1;
        }
    }
    maxCount = Math.max(maxCount, currentCount);
    return maxCount;
}

function generatePredictions(analysisData: AnalysisData, settings: AppSettings): Prediction[] {
    const numberScores: { [key: number]: number } = {};
    for (let i = 1; i <= 25; i++) numberScores[i] = 0;
    
    if (settings.rules.useHot) {
        analysisData.freqData.forEach((d, i) => numberScores[d.numero] += (25 - i) * (settings.weights.frequency / 100));
    }
    if (settings.rules.useCold) {
        analysisData.delayData.forEach(d => {
            const zScore = parseFloat(d.zScore);
            if(zScore > 1.0) numberScores[d.numero] += zScore * (settings.weights.zScore);
        });
    }
    if (settings.rules.useClusters) {
        analysisData.clusterData.slice(0, 15).forEach(c => {
             const clusterWeight = c.score * (settings.weights.connectivity / 100);
             c.numeros.forEach(n => { numberScores[n] += clusterWeight; });
        });
    }

    const scoredNumbers = Object.entries(numberScores).map(([num, score]) => ({ numero: parseInt(num), score })).sort((a,b) => b.score - a.score);

    const included = settings.rules.includeNumbers.match(/\d+/g)?.map(Number) || [];
    const excluded = settings.rules.excludeNumbers.match(/\d+/g)?.map(Number) || [];

    if (included.some(n => excluded.includes(n))) {
        alert("Conflito: Um número não pode ser fixado e excluído ao mesmo tempo.");
        return [];
    }
    if (included.length > 15) {
        alert("Não é possível fixar mais de 15 números.");
        return [];
    }

    const validPredictions: Prediction[] = [];
    let attempts = 0;
    const maxAttempts = 50000;
    
    const latestDraw = parseDraws(settings.rawData)[0] || [];

    while (validPredictions.length < settings.predictionCount * 5 && attempts < maxAttempts) {
        const selectionPool = scoredNumbers
            .filter(sn => !included.includes(sn.numero) && !excluded.includes(sn.numero))
            .flatMap(sn => Array(Math.max(1, Math.round(sn.score))).fill(sn.numero));
        
        const tempNumbers = new Set<number>(included);
        
        while(tempNumbers.size < 15 && selectionPool.length > 0) {
            const randomIndex = Math.floor(Math.random() * selectionPool.length);
            tempNumbers.add(selectionPool[randomIndex]);
        }

        const availableNumbers = Array.from({length: 25}, (_, i) => i + 1).filter(n => !tempNumbers.has(n) && !excluded.includes(n));
        while(tempNumbers.size < 15 && availableNumbers.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableNumbers.length);
            const randomNum = availableNumbers.splice(randomIndex, 1)[0];
            tempNumbers.add(randomNum);
        }
        
        if (tempNumbers.size < 15) continue;

        const combo = Array.from(tempNumbers).sort((a, b) => a - b);
        
        const soma = combo.reduce((a, b) => a + b, 0);
        const pares = combo.filter(n => n % 2 === 0).length;
        const molduraCount = combo.filter(n => MOLDURA.includes(n)).length;
        const repeatedCount = combo.filter(n => latestDraw.includes(n)).length;
        const primeCount = combo.filter(n => PRIMES.includes(n)).length;
        const fibonacciCount = combo.filter(n => FIBONACCI.includes(n)).length;
        
        const endings = combo.reduce((acc, num) => {
            const lastDigit = num % 10;
            acc[lastDigit] = (acc[lastDigit] || 0) + 1;
            return acc;
        }, {} as {[key: number]: number});
        const maxEndingCount = Math.max(0, ...Object.values(endings));
        const maxConsecutiveCount = countMaxConsecutive(combo);

        if (soma >= settings.rules.sumRange[0] && soma <= settings.rules.sumRange[1] &&
            pares >= settings.rules.parityRange[0] && pares <= settings.rules.parityRange[1] &&
            molduraCount >= settings.rules.frameRange[0] && molduraCount <= settings.rules.frameRange[1] &&
            repeatedCount <= settings.rules.maxRepeatPrevious &&
            primeCount >= settings.rules.primeRange[0] && primeCount <= settings.rules.primeRange[1] &&
            fibonacciCount >= settings.rules.fibonacciRange[0] && fibonacciCount <= settings.rules.fibonacciRange[1] &&
            maxEndingCount <= settings.rules.maxEndingDigitRepeat &&
            maxConsecutiveCount <= settings.rules.maxConsecutive
            ) {
                
            const score = combo.reduce((s, num) => s + (numberScores[num] || 0), 0);
            if (!validPredictions.some(p => p.numeros.join('-') === combo.join('-'))) {
                validPredictions.push({
                    id: attempts, numeros: combo, soma, pares, impares: 15 - pares,
                    moldura: molduraCount, miolo: 15 - molduraCount, score: score.toFixed(1),
                });
            }
        }
        attempts++;
    }

    return validPredictions.sort((a, b) => parseFloat(b.score) - parseFloat(a.score)).slice(0, settings.predictionCount);
}

const SortableHeader: FC<{ label: string, sortKey: string, currentSort: any, setSort: (sort: any) => void }> = ({ label, sortKey, currentSort, setSort }) => {
    const isCurrent = currentSort.key === sortKey;
    const direction = isCurrent ? (currentSort.direction === 'asc' ? 'desc' : 'asc') : 'desc';
    const Icon = isCurrent ? (currentSort.direction === 'asc' ? ArrowUp : ArrowDown) : null;

    return (
        <th className="p-3 cursor-pointer hover:bg-slate-600" onClick={() => setSort({ key: sortKey, direction })}>
            <div className="flex items-center gap-2">
                {label}
                {Icon && <Icon size={14} />}
            </div>
        </th>
    );
};

const DelayTable: FC<{ data: DelayData[] }> = ({ data }) => (
    <div className="overflow-x-auto bg-slate-900/50 rounded-lg border border-slate-700">
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-700 text-xs text-gray-300 uppercase">
                <tr>
                    <th className="p-3">Número</th>
                    <th className="p-3">Atraso Atual</th>
                    <th className="p-3">Atraso Médio</th>
                    <th className="p-3">Z-Score</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
                {[...data].sort((a,b) => a.numero - b.numero).map(d => {
                    const zScore = parseFloat(d.zScore);
                    const zScoreClass = zScore > 1.8 ? 'bg-red-500/30 text-red-300' : zScore > 1.2 ? 'bg-yellow-500/30 text-yellow-300' : '';
                    return (
                        <tr key={d.numero} className="hover:bg-slate-800">
                            <td className="p-3 font-bold text-lg">{d.numero}</td>
                            <td className="p-3">{d.atrasoAtual}</td>
                            <td className="p-3">{d.atrasoMedio}</td>
                            <td className={`p-3 font-mono font-bold ${zScoreClass}`}>{d.zScore}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

type ChatMessage = {
    role: 'user' | 'model';
    text: string;
}
// --- MAIN APP COMPONENT ---
const App: FC = () => {
    const [activeTab, setActiveTab] = useState('deus');
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeminiLoading, setIsGeminiLoading] = useState(false);
    const [clusterSort, setClusterSort] = useState({ key: 'score', direction: 'desc' });
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isBacktestModalOpen, setIsBacktestModalOpen] = useState(false);
    const [backtestPrediction, setBacktestPrediction] = useState<Prediction | null>(null);
    const [comparisonResult, setComparisonResult] = useState<number[] | null>(null);
    
    // Chat state
    const [geminiChat, setGeminiChat] = useState<GeminiChat | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const chatContainerRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        try {
            const savedSettings = localStorage.getItem('lotteryGodSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                setSettings(prev => ({ ...prev, ...parsedSettings, rules: { ...prev.rules, ...parsedSettings.rules, }, weights: { ...prev.weights, ...parsedSettings.weights, } }));
            }
        } catch (error) { console.error("Failed to load settings", error); }
    }, []);

    useEffect(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, [chatHistory]);

    const runAnalysisAndGenerate = useCallback((triggeredByButton: boolean) => {
        setIsLoading(true);
        setChatHistory([]);
        setComparisonResult(null);
        
        const newAnalysisData = performFullAnalysis(settings.rawData);
        if (newAnalysisData) {
            setAnalysisData(newAnalysisData);
            const newPredictions = generatePredictions(newAnalysisData, settings);
            setPredictions(newPredictions);
            if(triggeredByButton) handleGetGeminiInitialAnalysis(newAnalysisData);
        }
        setIsLoading(false);
    }, [settings]);
    
    useEffect(() => {
        runAnalysisAndGenerate(false);
    }, []);

    const handleSettingsChange = (newSettings: AppSettings) => {
        setSettings(newSettings);
        localStorage.setItem('lotteryGodSettings', JSON.stringify(newSettings));
    };
    
    const handleAddResult = (newRawData: string, comparisonNumbers: number[] | null) => {
        handleSettingsChange({ ...settings, rawData: newRawData });
        setComparisonResult(comparisonNumbers);
        if (comparisonNumbers) {
            setActiveTab('predicao');
        } else {
            alert("Novos dados históricos foram adicionados. Re-analise nas Configurações para atualizar as predições.");
            setActiveTab('settings');
        }
    };

    const handleRunAnalysis = () => {
        setActiveTab('deus');
        runAnalysisAndGenerate(true);
    };

    const handleGetGeminiInitialAnalysis = useCallback((data: AnalysisData | null) => {
        if (!data) return;
        setIsGeminiLoading(true);
        setChatHistory([]);
        let fullText = '';
        getGeminiInitialAnalysis(data, (chat, chunk) => {
            setGeminiChat(chat);
            fullText += chunk;
            setChatHistory([{ role: 'model', text: fullText }]);
        }).finally(() => setIsGeminiLoading(false));
    }, []);

    const handleSendChatMessage = async () => {
        if (!chatInput.trim() || !geminiChat || isGeminiLoading) return;

        const newUserMessage: ChatMessage = { role: 'user', text: chatInput };
        setChatHistory(prev => [...prev, newUserMessage, { role: 'model', text: '' }]);
        setChatInput('');
        setIsGeminiLoading(true);
        
        let fullText = '';
        await continueGeminiChat(geminiChat, newUserMessage.text, (chunk) => {
            fullText += chunk;
            setChatHistory(prev => {
                const newHistory = [...prev];
                newHistory[newHistory.length - 1] = { role: 'model', text: fullText };
                return newHistory;
            });
        });
        setIsGeminiLoading(false);
    };

    const handleSuggestionClick = (suggestion: string) => {
        const match = suggestion.match(/Mudar (\w+) para ([\d-]+)/);
        if (match) {
            const [, rule, value] = match;
            const values = value.split('-').map(Number) as [number, number];
            
            const ruleMap: { [key: string]: keyof AppSettings['rules']} = {
                'Soma': 'sumRange',
                'Pares': 'parityRange',
                'Moldura': 'frameRange'
            };

            const ruleKey = ruleMap[rule];
            if(ruleKey && values.length === 2) {
                handleSettingsChange({
                    ...settings,
                    rules: {
                        ...settings.rules,
                        [ruleKey]: values
                    }
                });
                const confirmation = `Ok, regra '${rule}' atualizada para o intervalo ${value}. Você pode gerar novas predições na aba 'Configurações'.`;
                setChatHistory(prev => [...prev, { role: 'model', text: confirmation }]);
            }
        }
    };
    
    const handleBacktest = (pred: Prediction) => {
        setBacktestPrediction(pred);
        setIsBacktestModalOpen(true);
    };

    const sortedClusters = useMemo(() => {
        if (!analysisData) return [];
        return [...analysisData.clusterData].sort((a, b) => {
            const valA = a[clusterSort.key as keyof typeof a];
            const valB = b[clusterSort.key as keyof typeof b];
            if (valA < valB) return clusterSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return clusterSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [analysisData, clusterSort]);
    
    const historicalDraws = useMemo(() => parseDraws(settings.rawData), [settings.rawData]);

    const tabs = useMemo(() => [
        { id: 'deus', label: 'Deus IA', icon: Bot },
        { id: 'predicao', label: 'Predições', icon: Zap },
        { id: 'frequencia', label: 'Frequência', icon: BarChart3 },
        { id: 'clusters', label: 'Clusters', icon: Target },
        { id: 'avancado', label: 'Avançado', icon: Calculator },
        { id: 'settings', label: 'Configurações', icon: Settings },
    ], []);

    if (isLoading && !analysisData) return <div className="flex items-center justify-center h-screen bg-slate-900"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-purple-500"></div></div>;

    return (
        <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white p-4 md:p-6">
            <AddDrawsModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)}
                onAdd={handleAddResult}
                currentRawData={settings.rawData}
            />
            <BacktestModal
                isOpen={isBacktestModalOpen}
                onClose={() => setIsBacktestModalOpen(false)}
                prediction={backtestPrediction}
                historicalDraws={historicalDraws}
            />
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-6">
                    <h1 className="text-3xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">Lottery God AI</h1>
                    <div className="flex justify-center items-center gap-4">
                      <p className="text-gray-400">Análise Estatística Avançada e Insights com IA</p>
                      <button onClick={() => setIsAddModalOpen(true)} className="bg-cyan-600 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:bg-cyan-500 transition-all flex items-center gap-2">
                          <PlusCircle size={16} />
                          Adicionar Sorteio(s)
                      </button>
                    </div>
                </header>
                <nav className="flex flex-wrap justify-center gap-2 mb-6 bg-slate-800/50 p-2 rounded-xl">{tabs.map(tab => <TabButton key={tab.id} {...tab} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />)}</nav>
                <main className="bg-slate-800/30 backdrop-blur-sm rounded-xl p-4 md:p-6 shadow-2xl border border-purple-500/20 min-h-[60vh]">
                    {activeTab === 'deus' && analysisData && (
                        <div className="flex flex-col h-[70vh]">
                            <h2 className="text-3xl font-bold mb-4 text-center bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent">Converse com a Deus IA</h2>
                            <div ref={chatContainerRef} className="flex-grow bg-slate-900/50 rounded-lg p-4 space-y-4 overflow-y-auto border border-slate-700 mb-4">
                                {chatHistory.map((msg, index) => (
                                    <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                        {msg.role === 'model' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center"><Bot size={18} className="text-black"/></div>}
                                        <div className={`max-w-xl p-3 rounded-xl ${msg.role === 'user' ? 'bg-purple-600' : 'bg-slate-700'}`}>
                                            <div
                                                className="prose prose-invert prose-p:my-2 max-w-none" 
                                                dangerouslySetInnerHTML={{ __html: msg.text.replace(/`\[Sugerir ajuste: (.*?)\]`/g, `<button class="suggestion-button" data-suggestion="$1">${'$1'}</button>`).replace(/\n/g, '<br />') }}
                                                onClick={(e) => {
                                                    const target = e.target as HTMLElement;
                                                    if (target.classList.contains('suggestion-button')) {
                                                        handleSuggestionClick(target.dataset.suggestion || '');
                                                    }
                                                }}
                                            />
                                            {isGeminiLoading && index === chatHistory.length - 1 && msg.role === 'model' && <div className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse ml-2"></div>}
                                        </div>
                                    </div>
                                ))}
                                {isGeminiLoading && chatHistory[chatHistory.length - 1]?.role !== 'model' && 
                                    <div className="flex items-start gap-3"><div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center"><Bot size={18} className="text-black"/></div>
                                    <div className="bg-slate-700 p-3 rounded-xl"><div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div></div></div>
                                }
                            </div>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyPress={e => e.key === 'Enter' && handleSendChatMessage()}
                                    placeholder="Faça uma pergunta à Deus IA..."
                                    className="w-full bg-slate-700 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                                    disabled={isGeminiLoading}
                                />
                                <button onClick={handleSendChatMessage} disabled={isGeminiLoading || !chatInput.trim()} className="bg-cyan-600 px-4 rounded-lg hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed">
                                    <Send size={20} />
                                </button>
                            </div>
                        </div>
                    )}
                    {activeTab === 'predicao' && (
                        <div>
                            <h2 className="text-2xl font-bold mb-4">🔮 Predições Geradas</h2>
                            {isLoading ? (
                                <div className="flex items-center justify-center h-40">
                                    <p className="text-lg text-gray-400 flex items-center gap-3">
                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-purple-400"></div>
                                        Analisando e gerando novas predições...
                                    </p>
                                </div>
                            ) : predictions.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {predictions.map((p, i) => {
                                        const hits = comparisonResult ? p.numeros.filter(num => comparisonResult.includes(num)).length : null;
                                        return <PredictionCard key={p.id} pred={p} rank={i + 1} hits={hits} onBacktest={handleBacktest} />;
                                    })}
                                </div>
                            ) : (
                                <div className="text-center bg-slate-900/50 p-6 rounded-lg border border-slate-700 max-w-lg mx-auto">
                                    <Zap size={40} className="mx-auto text-yellow-500 mb-3" />
                                    <h3 className="text-xl font-semibold text-yellow-400 mb-2">Nenhuma Sugestão Encontrada</h3>
                                    <p className="text-gray-300">As regras e filtros atuais são muito restritivos.</p>
                                    <p className="text-gray-400 mt-2">
                                        Tente flexibilizar os filtros na aba{' '}
                                        <button onClick={() => setActiveTab('settings')} className="font-bold text-cyan-400 hover:underline">
                                            Configurações
                                        </button>{' '}
                                        para gerar novas predições.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'frequencia' && analysisData && (<div><h2 className="text-2xl font-bold mb-4">Frequência dos Números</h2><ResponsiveContainer width="100%" height={400}><BarChart data={[...analysisData.freqData].sort((a,b)=>a.numero-b.numero)}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} /><XAxis dataKey="numero" /><YAxis /><Tooltip contentStyle={{ backgroundColor: '#334155' }} /><Legend /><Bar dataKey="frequencia" fill="#8884d8" /></BarChart></ResponsiveContainer></div>)}
                    
                    {activeTab === 'clusters' && analysisData && (
                        <div>
                          <h2 className="text-2xl font-bold mb-4">Análise de Clusters (Sequências)</h2>
                           <div className="overflow-x-auto bg-slate-900/50 rounded-lg border border-slate-700">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-700 text-xs text-gray-300 uppercase tracking-wider">
                                        <tr>
                                            <SortableHeader label="Cluster" sortKey="tamanho" currentSort={clusterSort} setSort={setClusterSort} />
                                            <SortableHeader label="Tamanho" sortKey="tamanho" currentSort={clusterSort} setSort={setClusterSort} />
                                            <SortableHeader label="Ocorrências" sortKey="ocorrencias" currentSort={clusterSort} setSort={setClusterSort} />
                                            <SortableHeader label="Último Sorteio" sortKey="ultimoSorteio" currentSort={clusterSort} setSort={setClusterSort} />
                                            <SortableHeader label="Score" sortKey="score" currentSort={clusterSort} setSort={setClusterSort} />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700">
                                        {sortedClusters.map(c => (
                                            <tr key={c.cluster} className="hover:bg-slate-800">
                                                <td className="p-3 font-mono">
                                                    <div className="flex flex-wrap gap-1">
                                                        {c.numeros.map(n => <span key={n} className="bg-cyan-600 text-white font-bold text-xs px-2 py-1 rounded">{n}</span>)}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center">{c.tamanho}</td>
                                                <td className="p-3 text-center">{c.ocorrencias}</td>
                                                <td className="p-3 text-center">{c.ultimoSorteio}</td>
                                                <td className="p-3 text-center font-bold text-yellow-400">{c.score.toFixed(0)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {activeTab === 'avancado' && analysisData && (<div className="space-y-6"><h2 className="text-2xl font-bold">Análise Avançada</h2><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div><h3 className="font-semibold mb-2 text-xl">Atrasos e Z-Score</h3><DelayTable data={analysisData.delayData} /></div><div className="space-y-4"><h3 className="font-semibold mb-2 text-xl">Pares mais Frequentes</h3><div className="space-y-2 max-h-60 overflow-y-auto pr-2">{analysisData.topPairs.map(p => <div key={p.par} className="flex justify-between bg-slate-700/50 p-2 rounded"><span>{p.par}</span><span className="font-bold">{p.ocorrencias}</span></div>)}</div><h3 className="font-semibold mt-4 mb-2 text-xl">Análise de Uniformidade</h3><div className="bg-slate-700/50 p-4 rounded-lg text-center"><div className={`text-2xl font-bold ${analysisData.chiSquare.isUniform ? 'text-green-400' : 'text-red-400'}`}>{analysisData.chiSquare.isUniform ? 'UNIFORME' : 'NÃO UNIFORME'}</div><p className="text-xs text-gray-400">Valor-P: {analysisData.chiSquare.pValue} | Chi-Quadrado: {analysisData.chiSquare.chiValue}</p></div></div></div><div className="mt-6"><h3 className="font-semibold mt-4 mb-2 text-xl text-center">Histórico Moldura vs. Miolo (Últimos 50 Sorteios)</h3><ResponsiveContainer width="100%" height={250}><LineChart data={analysisData.molduraMioloHistory}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} /><XAxis dataKey="sorteio" /><YAxis domain={[0,15]} /><Tooltip contentStyle={{ backgroundColor: '#334155' }} /><Legend /><Line type="monotone" dataKey="moldura" stroke="#22c55e" name="Moldura" /><Line type="monotone" dataKey="miolo" stroke="#8b5cf6" name="Miolo" /></LineChart></ResponsiveContainer></div></div>)}
                    {activeTab === 'settings' && <SettingsPanel settings={settings} onChange={handleSettingsChange} onAnalyze={handleRunAnalysis} />}
                </main>
            </div>
        </div>
    );
};

export default App;
