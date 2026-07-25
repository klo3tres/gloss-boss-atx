export type OwnerQuoteInput = {
  catalogPriceCents: number;
  vehicleCount: number;
  vehicleSize: 'compact'|'standard'|'large'|'xl';
  interiorCondition: number;
  exteriorCondition: number;
  dirtiness: number;
  petHair: boolean;
  stains: boolean;
  odor: boolean;
  excessiveTrash: boolean;
  paintCondition: number;
  addOnCents: number;
  travelMiles: number;
  promotionCents: number;
  membershipDiscountCents: number;
  creditCents: number;
  manualDiscountCents: number;
  taxRateBps: number;
  depositRateBps: number;
  baseLaborMinutes: number;
  availableMinutes?: number;
  productCostRateBps?: number;
  processingRateBps?: number;
};

export type OwnerQuoteCalculation = {
  catalogCents:number; conditionSurchargeCents:number; addOnCents:number; travelFeeCents:number;
  discountCents:number; taxableCents:number; taxCents:number; totalCents:number; depositCents:number;
  laborMinutes:number; estimatedCostCents:number; estimatedMarginCents:number; minimumProfitableCents:number;
  warnings:string[];
};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:0));

export function calculateOwnerQuote(input: OwnerQuoteInput): OwnerQuoteCalculation {
  const vehicleCount=clamp(Math.round(input.vehicleCount),1,10);
  const sizeMultiplier={compact:.92,standard:1,large:1.18,xl:1.35}[input.vehicleSize];
  const catalogCents=Math.round(clamp(input.catalogPriceCents,0,10_000_000)*vehicleCount*sizeMultiplier);
  const conditionPoints=clamp(input.interiorCondition,0,4)+clamp(input.exteriorCondition,0,4)+clamp(input.dirtiness,0,4)+clamp(input.paintCondition,0,4);
  const conditionFlags=[input.petHair,input.stains,input.odor,input.excessiveTrash].filter(Boolean).length;
  const conditionSurchargeCents=Math.round(catalogCents*Math.min(.7,conditionPoints*.035+conditionFlags*.07));
  const addOnCents=clamp(input.addOnCents,0,10_000_000);
  const travelFeeCents=Math.max(0,Math.round((input.travelMiles-15)*125));
  const gross=catalogCents+conditionSurchargeCents+addOnCents+travelFeeCents;
  const discountCents=Math.min(gross,clamp(input.promotionCents,0,gross)+clamp(input.membershipDiscountCents,0,gross)+clamp(input.creditCents,0,gross)+clamp(input.manualDiscountCents,0,gross));
  const taxableCents=Math.max(0,gross-discountCents);
  const taxCents=Math.round(taxableCents*clamp(input.taxRateBps,0,2500)/10000);
  const totalCents=taxableCents+taxCents;
  const laborMinutes=Math.max(30,Math.round(input.baseLaborMinutes*vehicleCount*sizeMultiplier*(1+conditionPoints*.035+conditionFlags*.08)));
  const productCost=Math.round(gross*clamp(input.productCostRateBps??900,0,5000)/10000);
  const processingCost=Math.round(totalCents*clamp(input.processingRateBps??300,0,1000)/10000);
  const estimatedCostCents=productCost+processingCost+Math.round(laborMinutes/60*2500)+travelFeeCents;
  const minimumProfitableCents=Math.ceil(estimatedCostCents/.65);
  const estimatedMarginCents=totalCents-estimatedCostCents;
  const warnings:string[]=[];
  if(input.promotionCents>0&&input.membershipDiscountCents>0&&input.manualDiscountCents>0)warnings.push('Three discounts are stacked; verify the promotion permits stacking.');
  if(totalCents<minimumProfitableCents)warnings.push(`Price is below the minimum profitable threshold by $${((minimumProfitableCents-totalCents)/100).toFixed(2)}.`);
  if(conditionPoints+conditionFlags*2>=14&&catalogCents<20_000)warnings.push('Vehicle condition may require a restoration-level service instead of the selected package.');
  if(input.availableMinutes&&laborMinutes>input.availableMinutes)warnings.push(`Appointment needs about ${laborMinutes-input.availableMinutes} more minutes than the selected window.`);
  return {catalogCents,conditionSurchargeCents,addOnCents,travelFeeCents,discountCents,taxableCents,taxCents,totalCents,depositCents:Math.round(totalCents*clamp(input.depositRateBps,0,10000)/10000),laborMinutes,estimatedCostCents,estimatedMarginCents,minimumProfitableCents,warnings};
}

