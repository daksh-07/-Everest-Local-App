import { useEffect,useState } from 'react';
import { Stack,usePathname,useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase,supabaseConfigured } from '@/lib/supabase';
import type { AppRole } from '@/lib/types';
const protectedRoutes=new Set(['/account','/request','/requests','/quotes','/bookings','/orders','/cart','/messages','/reviews','/notifications','/settings']);
const businessRoutes=new Set(['/business-dashboard','/business-verification','/business-orders','/business-bookings','/products','/services','/service-areas','/opportunities']);
const adminRoutes=new Set(['/admin']);const deliveryRoutes=new Set(['/delivery']);
export default function RootLayout(){const pathname=usePathname();const router=useRouter();const [ready,setReady]=useState(!supabaseConfigured);const [role,setRole]=useState<AppRole|null>(null);
 useEffect(()=>{if(!supabaseConfigured){setReady(true);return;}let active=true;const load=async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session){if(active){setRole(null);setReady(true)}}else{const {data}=await supabase.from('profiles').select('role').eq('id',session.user.id).maybeSingle();if(active){setRole((data?.role as AppRole|undefined)??null);setReady(true)}}};void load();const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{void load()});return()=>{active=false;subscription.unsubscribe()}},[]);
 useEffect(()=>{if(!ready||!supabaseConfigured)return;const needsAuth=protectedRoutes.has(pathname)||businessRoutes.has(pathname)||adminRoutes.has(pathname)||deliveryRoutes.has(pathname);if(!needsAuth)return;if(!role){router.replace('/auth');return;}if(adminRoutes.has(pathname)&&role!=='ADMIN'){router.replace('/');return;}if(deliveryRoutes.has(pathname)&&role!=='ADMIN'&&role!=='DELIVERY_DRIVER'){router.replace('/');return;}if(businessRoutes.has(pathname)&&role!=='BUSINESS'&&role!=='ADMIN'){router.replace('/');}},[pathname,ready,role,router]);
 return <><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,animation:'fade'}}/></>;
}
