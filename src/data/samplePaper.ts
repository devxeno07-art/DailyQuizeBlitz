/**
 * Ready-to-load GSRTC mock paper.
 * These questions are original practice questions covering GSRTC,
 * the Motor Vehicles Act and general Gujarat GK.
 */

export interface SampleQuestion {
  questionText: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard";
}

export const SAMPLE_GSRTC_PAPER = {
  title: "GSRTC નમૂનો મોક ટેસ્ટ (25 MCQs)",
  subject: "GSRTC, મોટર વ્હીકલ કાયદો & ગુજરાત સામાન્ય જ્ઞાન",
  category: "GSRTC સ્પેશિયલ",
  description:
    "GSRTC કંડક્ટર/ડ્રાઈવર પરીક્ષાની તૈયારી માટે 25 મહત્વના પ્રશ્નો. એક ક્લિકમાં આ પેપર તમારી લાઈબ્રેરીમાં ઉમેરાશે.",
  targetQuestions: 25,
  timeLimitMinutes: 60,
  questions: [
    {
      questionText: "GSRTC નું પૂરું નામ શું છે?",
      options: [
        "Gujarat State Road Transport Corporation",
        "Gujarat Super Railway Transport Company",
        "Gujarat State Rapid Transit Corporation",
        "Gujarat Safety Road Traffic Council",
      ],
      correctAnswer: 0,
      explanation:
        "GSRTC = Gujarat State Road Transport Corporation (ગુજરાત રાજ્ય માર્ગ પરિવહન નિગમ).",
      difficulty: "easy",
    },
    {
      questionText: "ગુજરાત રાજ્ય માર્ગ પરિવહન નિગમ (GSRTC) ની સ્થાપના ક્યારે થઈ હતી?",
      options: ["1 મે 1960", "15 ઓગસ્ટ 1947", "26 જાન્યુઆરી 1950", "1 એપ્રિલ 1965"],
      correctAnswer: 0,
      explanation:
        "ગુજરાત રાજ્યની સ્થાપના 1 મે 1960ના રોજ થઈ અને તે જ દિવસે GSRTCની સ્થાપના પણ થઈ.",
      difficulty: "easy",
    },
    {
      questionText: "GSRTC નું મુખ્યાલય કયા શહેરમાં આવેલું છે?",
      options: ["અમદાવાદ", "ગાંધીનગર", "વડોદરા", "સુરત"],
      correctAnswer: 0,
      explanation: "GSRTCનું મુખ્ય મુખ્યાલય અમદાવાદમાં છે.",
      difficulty: "easy",
    },
    {
      questionText: "ભારતમાં પ્રવાસી વાહનો માટે મુખ્ય કાયદો કયો છે?",
      options: [
        "મોટર વ્હીકલ એક્ટ, 1988",
        "ભારતીય દંડ સંહિતા, 2023",
        "કંપની કાયદો, 2013",
        "મોટર વ્હીકલ એક્ટ, 1947",
      ],
      correctAnswer: 0,
      explanation:
        "ભારતમાં મોટર વાહનોનું નિયમન મોટર વ્હીકલ એક્ટ, 1988 હેઠળ થાય છે.",
      difficulty: "medium",
    },
    {
      questionText: "કાર ચલાવવા માટે લર્નર્સ લાઇસન્સની લઘુત્તમ ઉંમર કેટલી છે?",
      options: ["18 વર્ષ", "16 વર્ષ", "21 વર્ષ", "20 વર્ષ"],
      correctAnswer: 0,
      explanation:
        "જ્યારે 16 વર્ષથી 18 વર્ષ વચ્ચે 50cc સુધીની ગિયરલેસ ટુ-વ્હીલર ચલાવી શકાય, કાર માટે 18 વર્ષ જરૂરી છે.",
      difficulty: "easy",
    },
    {
      questionText: "લર્નર્સ લાઇસન્સની માન્યતા કેટલા સમય માટે હોય છે?",
      options: ["6 મહિના", "1 વર્ષ", "3 મહિના", "2 વર્ષ"],
      correctAnswer: 0,
      explanation: "લર્નર્સ લાઇસન્સ 6 મહિના સુધી માન્ય રહે છે.",
      difficulty: "easy",
    },
    {
      questionText: "ટ્રાન્સપોર્ટ વાહન (બસ/ટ્રક) માટે ડ્રાઇવિંગ લાઇસન્સ કેટલા વર્ષે રિન્યુ કરાવવું પડે છે?",
      options: ["3 વર્ષ", "5 વર્ષ", "10 વર્ષ", "20 વર્ષ"],
      correctAnswer: 0,
      explanation:
        "ટ્રાન્સપોર્ટ વાહનોના ડ્રાઇવિંગ લાઇસન્સની માન્યતા સામાન્ય રીતે 3 વર્ષની હોય છે.",
      difficulty: "medium",
    },
    {
      questionText: "ભારતમાં રાષ્ટ્રીય ધોરીમાર્ગોની જવાબદારી કઈ સંસ્થા સંભાળે છે?",
      options: ["NHAI", "IRCTC", "ISRO", "FCI"],
      correctAnswer: 0,
      explanation:
        "National Highways Authority of India (NHAI) રાષ્ટ્રીય ધોરીમાર્ગોનું નિર્માણ અને સંચાલન કરે છે.",
      difficulty: "medium",
    },
    {
      questionText: "ભારતમાં ઇમરજન્સી હેલ્પલાઇન નંબર કયો છે?",
      options: ["112", "100", "108", "181"],
      correctAnswer: 0,
      explanation: "112 એ ભારતનો એકીકૃત ઇમરજન્સી હેલ્પલાઇન નંબર છે.",
      difficulty: "easy",
    },
    {
      questionText: "GSRTC બસમાં 'S.T.' નું અર્થ શું થાય છે?",
      options: ["State Transport", "Super Transport", "Standard Travels", "State Taxi"],
      correctAnswer: 0,
      explanation: "S.T. એટલે State Transport — ગુજરાતમાં GSRTC બસોને 'એસ.ટી. બસ' કહેવાય છે.",
      difficulty: "easy",
    },
    {
      questionText: "ગુજરાતનું સૌથી લાંબુ નદી કઈ છે? (સંપૂર્ણપણે ગુજરાતમાં વહેતી)",
      options: ["સાબરમતી", "નર્મદા", "તાપી", "મહી"],
      correctAnswer: 0,
      explanation:
        "સાબરમતી ગુજરાતની સૌથી લાંબી નદી છે જે સંપૂર્ણપણે ગુજરાતમાં વહે છે. નર્મદા અને તાપી બહારથી આવે છે.",
      difficulty: "medium",
    },
    {
      questionText: "ગીર રાષ્ટ્રીય ઉદ્યાન કયા પ્રાણી માટે જાણીતું છે?",
      options: ["એશિયાઈ સિંહ", "વાઘ", "હાથી", "દરિયાઈ કાચબો"],
      correctAnswer: 0,
      explanation: "ગીર રાષ્ટ્રીય ઉદ્યાન એશિયાઈ સિંહોનું વિશ્વનું એકમાત્ર કુદરતી નિવાસસ્થાન છે.",
      difficulty: "easy",
    },
    {
      questionText: "ગુજરાતનું રાજ્યપ્રાણી કયું છે?",
      options: ["એશિયાઈ સિંહ", "સફેદ હરણ", "ભારતીય વાઘ", "એશિયાઈ હાથી"],
      correctAnswer: 0,
      explanation: "એશિયાઈ સિંહ ગુજરાતનું રાજ્યપ્રાણી છે.",
      difficulty: "easy",
    },
    {
      questionText: "ગુજરાતનું રાજ્યપક્ષી કયું છે?",
      options: ["સુરખાબ (Greater Flamingo)", "મોર", "કબૂતર", "પોપટ"],
      correctAnswer: 0,
      explanation: "સુરખાબ એટલે કે ગ્રેટર ફ્લેમિંગો ગુજરાતનું રાજ્યપક્ષી છે.",
      difficulty: "medium",
    },
    {
      questionText: "ગુજરાતની રાજધાની કયું શહેર છે?",
      options: ["ગાંધીનગર", "અમદાવાદ", "સુરત", "રાજકોટ"],
      correctAnswer: 0,
      explanation: "ગુજરાતની રાજધાની ગાંધીનગર છે.",
      difficulty: "easy",
    },
    {
      questionText: "સ્ટેચ્યુ ઓફ યુનિટી કોની પ્રતિમા છે?",
      options: [
        "સરદાર વલ્લભભાઈ પટેલ",
        "મહાત્મા ગાંધી",
        "ડો. બાબાસાહેબ આંબેડકર",
        "જવાહરલાલ નેહરુ",
      ],
      correctAnswer: 0,
      explanation:
        "સ્ટેચ્યુ ઓફ યુનિટી સરદાર વલ્લભભાઈ પટેલની પ્રતિમા છે, જે કેવડિયા (નર્મદા) ખાતે આવેલી છે.",
      difficulty: "easy",
    },
    {
      questionText: "કચ્છના રણને બીજા કયા નામથી ઓળખવામાં આવે છે?",
      options: ["સફેદ રણ", "લીલું રણ", "કાળું રણ", "લાલ રણ"],
      correctAnswer: 0,
      explanation: "કચ્છના રણને 'સફેદ રણ' (White Rann) પણ કહેવાય છે.",
      difficulty: "easy",
    },
    {
      questionText: "સોમનાથ મંદિર કયા સ્થળે આવેલું છે?",
      options: ["પ્રભાસ પાટણ", "દ્વારકા", "અંબાજી", "શામળાજી"],
      correctAnswer: 0,
      explanation: "સોમનાથ મંદિર ગીર સોમનાથ જિલ્લાના પ્રભાસ પાટણ ખાતે આવેલું છે.",
      difficulty: "medium",
    },
    {
      questionText: "મોઢેરાનું સૂર્ય મંદિર કયા જિલ્લામાં આવેલું છે?",
      options: ["મહેસાણા", "પાટણ", "સુરત", "ભાવનગર"],
      correctAnswer: 0,
      explanation: "મોઢેરાનું સૂર્ય મંદિર મહેસાણા જિલ્લામાં આવેલું છે.",
      difficulty: "medium",
    },
    {
      questionText: "ગુજરાતી ભાષામાં સ્વર વર્ણ કેટલા છે?",
      options: ["11", "10", "12", "9"],
      correctAnswer: 0,
      explanation:
        "ગુજરાતીમાં અ, આ, ઇ, ઈ, ઉ, ઊ, ઋ, એ, ઐ, ઓ, ઔ — કુલ 11 સ્વર છે.",
      difficulty: "medium",
    },
    {
      questionText: "'સુંદર' શબ્દ કઈ જાતિનો છે?",
      options: ["વિશેષણ", "નામ", "ક્રિયાપદ", "સર્વનામ"],
      correctAnswer: 0,
      explanation: "'સુંદર' એ નામના ગુણને દર્શાવતું વિશેષણ છે.",
      difficulty: "easy",
    },
    {
      questionText: "200ના 15% કેટલા થાય?",
      options: ["30", "25", "35", "20"],
      correctAnswer: 0,
      explanation: "200 × 15/100 = 30.",
      difficulty: "easy",
    },
    {
      questionText: "એક બસ 60 કિમી/કલાકની ઝડપે 2.5 કલાકમાં કેટલું અંતર કાપશે?",
      options: ["150 કિમી", "120 કિમી", "180 કિમી", "135 કિમી"],
      correctAnswer: 0,
      explanation: "અંતર = ઝડપ × સમય = 60 × 2.5 = 150 કિમી.",
      difficulty: "easy",
    },
    {
      questionText: "10, 20, 30, 40 અને 50ની સરેરાશ કેટલી થાય?",
      options: ["30", "25", "35", "40"],
      correctAnswer: 0,
      explanation: "સરવાળો = 150, કુલ સંખ્યા = 5, સરેરાશ = 150 ÷ 5 = 30.",
      difficulty: "easy",
    },
    {
      questionText: "કચ્છનો મુખ્ય ઉદ્યોગ/ઓળખ કઈ છે?",
      options: ["મીઠાનું ઉત્પાદન", "ચા વાવેતર", "રબરનું ઉત્પાદન", "કોફી વાવેતર"],
      correctAnswer: 0,
      explanation: "કચ્છ ભારતના મીઠાના ઉત્પાદનનું મુખ્ય કેન્દ્ર છે.",
      difficulty: "medium",
    },
  ],
};

export type SamplePaper = typeof SAMPLE_GSRTC_PAPER;
