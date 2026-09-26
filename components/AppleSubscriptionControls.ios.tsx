import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {deepLinkToSubscriptions,finishTransaction,getAvailablePurchases,useIAP,type Purchase} from 'expo-iap';
import {APPLE_PRO_PRODUCT_ID,verifyApplePurchase} from '@/lib/apple-billing';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

type Props={
 businessId:string;
 active:boolean;
 provider:'STRIPE'|'APPLE';
 onActivated:()=>void;
};

export function AppleSubscriptionControls({businessId,active,provider,onActivated}:Props){
 const {colors}=useAppTheme();
 const st=useMemo(()=>styles(colors),[colors]);
 const [working,setWorking]=useState(false);
 const [message,setMessage]=useState('');
 const [localError,setLocalError]=useState('');

 const {connected,subscriptions,fetchProducts,requestPurchase}=useIAP({
  onPurchaseSuccess:purchase=>{void validateAndFinish(purchase);},
  onPurchaseError:error=>{
   setWorking(false);
   setLocalError(error.message||'Apple purchase was not completed.');
  },
 });

 useEffect(()=>{
  if(connected)void fetchProducts({skus:[APPLE_PRO_PRODUCT_ID],type:'subs'});
 },[connected,fetchProducts]);

 const product=subscriptions.find(item=>item.id===APPLE_PRO_PRODUCT_ID);
 const displayPrice=product?.displayPrice??'App Store price';

 async function validateAndFinish(purchase:Purchase){
  try{
   const transactionId=String(purchase.transactionId??'');
   if(!transactionId)throw new Error('Apple transaction ID was not returned.');
   const verified=await verifyApplePurchase(businessId,transactionId);
   if(!verified.active)throw new Error('Apple did not report an active Everest Pro subscription.');
   await finishTransaction({purchase,isConsumable:false});
   setMessage('Everest Pro is active through Apple.');
   setLocalError('');
   onActivated();
  }catch(error){
   setLocalError(error instanceof Error?error.message:'Apple subscription verification failed.');
  }finally{
   setWorking(false);
  }
 }

 async function subscribe(){
  if(!connected){setLocalError('Connecting to the App Store. Try again in a moment.');return;}
  setWorking(true);setMessage('');setLocalError('');
  try{
   await requestPurchase({request:{apple:{sku:APPLE_PRO_PRODUCT_ID}},type:'subs'});
  }catch(error){
   setWorking(false);
   setLocalError(error instanceof Error?error.message:'Apple purchase could not be started.');
  }
 }

 async function restore(){
  setWorking(true);setMessage('');setLocalError('');
  try{
   const purchases=await getAvailablePurchases({onlyIncludeActiveItemsIOS:true});
   const purchase=purchases.find(item=>item.productId===APPLE_PRO_PRODUCT_ID);
   if(!purchase)throw new Error('No active Everest Pro purchase was found for this Apple Account.');
   await validateAndFinish(purchase);
  }catch(error){
   setWorking(false);
   setLocalError(error instanceof Error?error.message:'Purchases could not be restored.');
  }
 }

 async function manage(){
  try{await deepLinkToSubscriptions();}
  catch(error){setLocalError(error instanceof Error?error.message:'Apple subscription settings could not be opened.');}
 }

 if(active&&provider==='STRIPE'){
  return <View style={st.note}>
   <Ionicons name="checkmark-circle" size={18} color={colors.brand}/>
   <Text style={st.noteText}>Everest Pro is already active through web billing. Your iPhone access is included.</Text>
  </View>;
 }

 return <View style={st.wrap}>
  <View style={st.appleRow}>
   <Ionicons name="logo-apple" size={19} color={colors.text}/>
   <View style={{flex:1}}>
    <Text style={st.appleTitle}>{active?'Everest Pro via Apple':'Subscribe with Apple'}</Text>
    <Text style={st.appleCopy}>{active?'Manage your App Store subscription.':displayPrice+' · auto-renewing monthly'}</Text>
   </View>
  </View>

  {active?
   <Pressable onPress={()=>void manage()} style={st.primary}>
    <Text style={st.primaryText}>MANAGE APPLE SUBSCRIPTION</Text><Ionicons name="open-outline" size={15} color={colors.onBrand}/>
   </Pressable>
   :
   <>
    <Pressable disabled={working} onPress={()=>void subscribe()} style={[st.primary,working&&{opacity:.65}]}>
     {working?<ActivityIndicator color={colors.onBrand}/>:<><Text style={st.primaryText}>SUBSCRIBE WITH APPLE</Text><Ionicons name="logo-apple" size={16} color={colors.onBrand}/></>}
    </Pressable>
    <Pressable disabled={working} onPress={()=>void restore()} style={st.secondary}><Text style={st.secondaryText}>RESTORE PURCHASES</Text></Pressable>
   </>
  }

  {message?<Text style={st.success}>{message}</Text>:null}
  {localError?<Text style={st.error}>{localError}</Text>:null}
 </View>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 wrap:{marginTop:18,borderWidth:1,borderColor:c.border,borderRadius:18,backgroundColor:c.surface,padding:15},
 appleRow:{flexDirection:'row',gap:11,alignItems:'center'},
 appleTitle:{fontSize:13,fontWeight:'900',color:c.text},
 appleCopy:{fontSize:10,lineHeight:15,color:c.muted,marginTop:2},
 primary:{height:50,borderRadius:15,alignItems:'center',justifyContent:'center',marginTop:14,backgroundColor:c.brand,flexDirection:'row',gap:8},
 primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand,letterSpacing:.5},
 secondary:{height:43,borderWidth:1,borderColor:c.border,borderRadius:13,alignItems:'center',justifyContent:'center',marginTop:9},
 secondaryText:{fontSize:9,fontWeight:'900',color:c.text,letterSpacing:.4},
 success:{fontSize:10,lineHeight:15,color:c.brand,marginTop:10},
 error:{fontSize:10,lineHeight:15,color:c.danger,marginTop:10},
 note:{marginTop:18,borderWidth:1,borderColor:c.border,borderRadius:16,backgroundColor:c.soft,padding:14,flexDirection:'row',gap:9,alignItems:'center'},
 noteText:{fontSize:10,lineHeight:16,color:c.muted,flex:1},
});
