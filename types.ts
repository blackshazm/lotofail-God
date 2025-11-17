
export interface Settings {
  rawData: string;
  predictionCount: number;
  rules: {
    useHot: boolean;
    useClusters: boolean;
    useCold: boolean;
    maxRepeatPrevious: number;
    parityRange: [number, number];
    sumRange: [number, number];
    frameRange: [number, number];
    primeRange: [number, number];
    fibonacciRange: [number, number];
    maxEndingDigitRepeat: number;
    maxConsecutive: number;
    includeNumbers: string;
    excludeNumbers: string;
  };
  weights: {
    frequency: number;
    connectivity: number;
    zScore: number;
  };
}

export interface FrequencyData {
  numero: number;
  frequencia: number;
  percentual: string;
}

export interface DelayData {
  numero: number;
  atrasoAtual: number;
  atrasoMedio: string;
  desvioPadrao: string;
  zScore: string;
}

export interface ClusterData {
  cluster: string;
  numeros: number[];
  tamanho: number;
  ocorrencias: number;
  ultimoSorteio: number;
  score: number;
}


export interface KSResult {
  statistic: string;
  isNormal: boolean;
}

export interface EntropyResult {
  entropy: string;
  normalized: string;
}

export interface ChiSquareResult {
    chiValue: string;
    pValue: string;
    isUniform: boolean;
    degreesFreedom: number;
}

export interface AnalysisData {
  freqData: FrequencyData[];
  delayData: DelayData[];
  topPairs: { par: string; ocorrencias: number }[];
  chiSquare: ChiSquareResult;
  molduraMioloHistory: { sorteio: number; moldura: number; miolo: number }[];
  ksResult: KSResult;
  entropyResult: EntropyResult;
  totalDraws: number;
  clusterData: ClusterData[];
}

export interface Prediction {
  id: number;
  numeros: number[];
  soma: number;
  pares: number;
  impares: number;
  moldura: number;
  miolo: number;
  score: string;
}