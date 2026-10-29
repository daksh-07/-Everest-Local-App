import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { AppTextInput as TextInput } from '@/components/ui/AppTextInput';
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ServicePicker } from "@/components/ServicePicker";
import { useReducedMotion } from "@/lib/motion";
import { DateTimeField } from "@/components/DateTimeField";
import {
  createClientIdempotencyKey,
  createServiceRequest,
  getProfile,
  type LocationSource,
  type RequestTimingMode,
} from "@/lib/marketplace";
import { uploadRequestMedia } from "@/lib/request-post-media";
import { supabase } from "@/lib/supabase";
import { userFacingError } from "@/lib/errors";
import {
  listServiceTaxonomy,
  type DeliveryMode,
  type ServiceDefinition,
  type TaxonomyCategory,
} from "@/lib/taxonomy";
import { type ThemeColors, useAppTheme } from "@/lib/theme";
import { startEverestLive, type LiveArrivalWindow } from "@/lib/everest-live";
import { geocodeServiceAddress, resolveCustomerServiceLocation, serviceAddressLabel } from "@/lib/customer-location";
import {userMessage} from '@/lib/errors';
import {hasPastRequestedTime,requestDrafts,type RequestDraft} from '@/lib/request-drafts';

type LocationValue = {
  addressLine1: string;
  suburb: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  formattedAddress: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  source: LocationSource;
  confirmed: boolean;
};
type BudgetChoice =
  "NONE" | "UNDER_100" | "100_250" | "250_500" | "500_PLUS" | "CUSTOM";
const timingWindows: Record<string, [string, string] | undefined> = {
  MORNING: ["08:00", "12:00"],
  AFTERNOON: ["12:00", "17:00"],
  EVENING: ["17:00", "21:00"],
};
function localDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// Example copy that matches the chosen service, so the hint never talks about cars when you need an electrician.
function detailsExample(service?: string | null) {
  const name = (service ?? "").toLowerCase();
  if (/electric/.test(name)) return "For example: Install two power points in the kitchen. The switchboard is in the garage.";
  if (/plumb|drain|gas/.test(name)) return "For example: Kitchen tap is leaking and the shower drains slowly.";
  if (/clean/.test(name)) return "For example: End-of-lease clean for a 2-bedroom apartment, including oven and windows.";
  if (/garden|landscap|lawn|tree/.test(name)) return "For example: Mow and edge a 200 sqm backyard, trim hedges and take away green waste.";
  if (/paint/.test(name)) return "For example: Repaint two bedrooms, walls and ceilings, colours already chosen.";
  if (/mov|remov/.test(name)) return "For example: Move a 1-bedroom flat 5 km across town, second floor with a lift.";
  if (/car|detail|auto|mechanic/.test(name)) return "For example: Interior and exterior detail for a sedan. The seats need deep cleaning.";
  if (/hair|beauty|nail|makeup|barber/.test(name)) return "For example: Bridal hair and makeup for two people on Saturday morning.";
  return "For example: What needs doing, roughly how big the job is, and anything about access or timing.";
}

function nextSaturday() {
  const d = new Date();
  const add = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (add || 7));
  d.setHours(12, 0, 0, 0);
  return d;
}
function timeValue(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Request() {
  const { colors } = useAppTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const params = useLocalSearchParams<{
    serviceId?: string;
    mode?: string;
    live?: string;
    resume?: string;
  }>();
  const live = params.live === "1" || params.live === "true";
  const serviceId =
    typeof params.serviceId === "string" ? params.serviceId : "";
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState("");
  const [detailsFocused,setDetailsFocused]=useState(false);
  const [mode, setMode] = useState<DeliveryMode>(
    params.mode === "REMOTE" ||
      params.mode === "BOTH" ||
      params.mode === "LOCAL"
      ? params.mode
      : "LOCAL",
  );
  const [serviceName, setServiceName] = useState("");
  const [serviceMode, setServiceMode] = useState<DeliveryMode | null>(null);
  const [serviceLoading, setServiceLoading] = useState(Boolean(serviceId));
  const [serviceValid, setServiceValid] = useState(!serviceId);
  const [taxonomyRetry, setTaxonomyRetry] = useState(0);
  const [taxonomyLoading, setTaxonomyLoading] = useState(!serviceId);
  const [serviceDefinitions, setServiceDefinitions] = useState<
    ServiceDefinition[]
  >([]);
  const [taxonomyCategories, setTaxonomyCategories] = useState<
    TaxonomyCategory[]
  >([]);
  const [selectedDefinition, setSelectedDefinition] =
    useState<ServiceDefinition | null>(null);
  const [location, setLocation] = useState<LocationValue>({
    addressLine1: "",
    suburb: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    formattedAddress: "",
    source: "MANUAL",
    confirmed: false,
  });
  const [locationAction, setLocationAction] = useState<"DEVICE" | "MANUAL" | null>(null);
  const locating = locationAction !== null;
  const addressEdited = useRef(false);
  const locationLock = useRef(false);
  const streetInput = useRef<TextInput>(null);
  const localityInput = useRef<TextInput>(null);
  const regionInput = useRef<TextInput>(null);
  const countryInput = useRef<TextInput>(null);
  const locationErrorInput = useRef<{current: TextInput | null} | null>(null);
  const [date, setDate] = useState<Date | null>(live ? new Date() : null);
  const [timing, setTiming] = useState<RequestTimingMode>(
    live ? "ASAP" : "FLEXIBLE",
  );
  const [arrivalWindow, setArrivalWindow] = useState<LiveArrivalWindow>("ASAP");
  const [windowKey, setWindowKey] = useState<
    "MORNING" | "AFTERNOON" | "EVENING" | null
  >(null);
  const [exactTime, setExactTime] = useState<Date | null>(null);
  const [budgetChoice, setBudgetChoice] = useState<BudgetChoice>("NONE");
  const [customBudget, setCustomBudget] = useState("");
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [expectedPhotoCount,setExpectedPhotoCount]=useState(0);
  const [photoPickerBusy,setPhotoPickerBusy]=useState(false);
  const photoPickerLock=useRef(false);const photoPickerEpoch=useRef(0);
  const missingPhotos=Math.max(0,expectedPhotoCount-photos.length);
  const [uploadProgress, setUploadProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    id: string;
    status: string;
    opportunities: number;
  } | null>(null);
  const [pendingLiveRequestId, setPendingLiveRequestId] = useState<
    string | null
  >(null);
  const submitRef = useRef(false);
  const requestIdempotencyKeyRef = useRef<string | null>(null);
  const [draftReady,setDraftReady]=useState(false);
  const [savedDraft,setSavedDraft]=useState<RequestDraft|null>(null);
  const [draftStatus,setDraftStatus]=useState('');
  const [draftNotice,setDraftNotice]=useState('');
  const restoredDefinition=useRef('');
  const [attempt,setAttempt]=useState<RequestDraft['attempt']>();
  const draftSession=useRef<ReturnType<typeof requestDrafts.open>|null>(null);
  const draftOwner=useRef('');
  const draftPaused=useRef(false);
  const draftTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const readyRef=useRef(false);readyRef.current=draftReady;
  const snapshot:RequestDraft={version:1,ownerId:draftOwner.current,savedAt:Date.now(),
    entry:{serviceId,live,mode:params.mode==='REMOTE'||params.mode==='BOTH'?params.mode:'LOCAL'},
    form:{photoCount:Math.max(photos.length,expectedPhotoCount),description,definitionId:selectedDefinition?.id??'',mode,
      location:{addressLine1:location.addressLine1,suburb:location.suburb,city:location.city,state:location.state,postalCode:location.postalCode,country:location.country},
      date:date?localDate(date):null,timing,arrivalWindow,windowKey,exactTime:exactTime?timeValue(exactTime):null,budgetChoice,customBudget},
    ...(attempt?{attempt}:{}),
  };
  const snapshotRef=useRef(snapshot);snapshotRef.current=snapshot;
  const snapshotKey=JSON.stringify({...snapshot,savedAt:0,ownerId:''});
  const flushDraft=useCallback(async()=>{
    if(!readyRef.current||draftPaused.current||!draftSession.current)return;
    const value=snapshotRef.current;
    if(!value.form.description.trim()&&!value.form.definitionId&&!value.entry.serviceId)return;
    await draftSession.current.save(value);
  },[]);
  useFocusEffect(useCallback(()=>{
    let active=true;setPhotoPickerBusy(false);setDraftReady(false);readyRef.current=false;draftPaused.current=false;
    void supabase.auth.getSession().then(async({data})=>{
      if(!active||!data.session?.user.id)return;
      draftOwner.current=data.session.user.id;
      const session=requestDrafts.open(draftOwner.current);draftSession.current=session;
      const draft=await session.load();if(!active)return;
      if(draft)setSavedDraft(draft);else setDraftReady(true);
    }).catch(()=>{if(active){setDraftStatus('Draft saving is unavailable on this device. Keep this page open and retry before posting.');setDraftReady(true)}});
    return()=>{active=false;photoPickerEpoch.current++;photoPickerLock.current=false;if(draftTimer.current)clearTimeout(draftTimer.current);if(readyRef.current&&!draftPaused.current){try{void draftSession.current?.save({...snapshotRef.current,entry:{...snapshotRef.current.entry,serviceId,live}}).catch(()=>undefined)}catch{/* Explicit logout can already have invalidated this writer. */}}draftSession.current?.close();draftSession.current=null};
  },[serviceId,live]));
  useEffect(()=>{
    if(!draftReady||draftPaused.current)return;
    if(!description.trim()&&!selectedDefinition&&!serviceId){setDraftStatus('Your details will be saved on this device as you write.');return;}
    setDraftStatus('Saving draft…');
    draftTimer.current=setTimeout(()=>{void flushDraft().then(()=>setDraftStatus('Draft saved on this device for 7 days.')).catch(()=>setDraftStatus('Draft could not be saved. Keep this page open and retry before posting.'))},350);
    return()=>{if(draftTimer.current)clearTimeout(draftTimer.current)};
  },[snapshotKey,draftReady,flushDraft,description,selectedDefinition,serviceId]);
  useEffect(()=>{
    const flush=()=>{void flushDraft().catch(()=>undefined)};
    const sub=AppState.addEventListener('change',state=>{if(state!=='active')flush()});
    if(Platform.OS==='web'){globalThis.addEventListener?.('pagehide',flush);globalThis.document?.addEventListener('visibilitychange',flush)}
    return()=>{sub.remove();if(Platform.OS==='web'){globalThis.removeEventListener?.('pagehide',flush);globalThis.document?.removeEventListener('visibilitychange',flush)}};
  },[flushDraft]);
  function resumeDraft(draft:RequestDraft){
    const target='/request'+(draft.entry.serviceId?'?serviceId='+encodeURIComponent(draft.entry.serviceId):'?')+(draft.entry.live?'&live=1':'')+'&mode='+draft.entry.mode+'&resume=1';
    if(draft.entry.serviceId!==serviceId||draft.entry.live!==live){router.replace(target as never);return;}
    const f=draft.form;setDescription(f.description);setMode(f.mode);addressEdited.current=true;
    setLocation({...f.location,formattedAddress:'',source:'MANUAL',confirmed:false});
    setPhotos([]);setExpectedPhotoCount(f.photoCount??0);
    restoredDefinition.current=f.definitionId;const selected=serviceDefinitions.find(row=>row.id===f.definitionId)??null;setSelectedDefinition(selected);
    const staleDate=hasPastRequestedTime({preferredDate:f.date??undefined,preferredTime:f.exactTime??undefined,timingMode:f.timing});setDate(f.date&&!staleDate?new Date(f.date+'T12:00:00'):null);
    setTiming(staleDate?'FLEXIBLE':f.timing);setWindowKey(staleDate?null:f.windowKey);
    setExactTime(f.exactTime&&!staleDate?new Date(localDate(new Date())+'T'+f.exactTime+':00'):null);
    setArrivalWindow(f.arrivalWindow);setBudgetChoice(f.budgetChoice);setCustomBudget(f.customBudget);
    setAttempt(draft.attempt);draftPaused.current=Boolean(draft.attempt);
    setSavedDraft(null);setDraftReady(true);setStep(1);
    setDraftNotice(staleDate?'Your saved date has passed. Choose a new date before posting.':'Draft restored. Review the details and confirm the service address again.');
  }
  async function discardDraft(){
    try{await draftSession.current?.clear();setSavedDraft(null);setDraftReady(true);setAttempt(undefined);setDescription('');setSelectedDefinition(null);setPhotos([]);setExpectedPhotoCount(0);setLocation({addressLine1:'',suburb:'',city:'',state:'',postalCode:'',country:'',formattedAddress:'',source:'MANUAL',confirmed:false});setDate(live?new Date():null);setTiming(live?'ASAP':'FLEXIBLE');setWindowKey(null);setExactTime(null);setBudgetChoice('NONE');setCustomBudget('');requestIdempotencyKeyRef.current=null;draftPaused.current=false;setDraftStatus('Saved request removed from this device.');}
    catch{setDraftStatus('The saved request could not be removed. Please retry.');}
  }
  const resumeDraftRef=useRef(resumeDraft);resumeDraftRef.current=resumeDraft;
  useEffect(()=>{
    if(params.resume==='1'&&savedDraft&&savedDraft.entry.serviceId===serviceId&&savedDraft.entry.live===live){resumeDraftRef.current(savedDraft);router.setParams({resume:undefined})}
  },[params.resume,savedDraft,serviceId,live]);
  const definitionMode =
    selectedDefinition?.default_delivery_mode ?? serviceMode;
  const effectiveMode =
    definitionMode === "BOTH" ? mode : (definitionMode ?? mode);
  const reduced = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const budgetY=useRef(0);const photosY=useRef(0);
  const transition = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(1 / 3)).current;
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    transition.setValue(reduced ? 1 : 0);
    const animation = Animated.parallel([
      Animated.timing(transition, {
        toValue: 1,
        duration: reduced ? 0 : 200,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: step / 3,
        duration: reduced ? 0 : 240,
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [step, reduced, transition, progress]);

  useEffect(() => {
    if (!error) return;
    if (step === 2 && locationErrorInput.current) {
      // Focus after validation has rendered, so the click/layout update cannot steal it.
      const input = locationErrorInput.current;
      const frame = requestAnimationFrame(() => input.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (step !== 2) scrollRef.current?.scrollToEnd({animated:!reduced});
  }, [error,reduced,step]);

  useEffect(() => {
    if (serviceId) {
      setTaxonomyLoading(false);
      return;
    }
    let active = true;
    setTaxonomyLoading(true);
    (async () => {
      try {
        const taxonomy = await listServiceTaxonomy();
        if (!active) return;
        setServiceDefinitions(taxonomy.services);
        if(restoredDefinition.current){const restored=taxonomy.services.find(row=>row.id===restoredDefinition.current)??null;setSelectedDefinition(restored);if(!restored)setDraftNotice('Your previous service type is no longer available. Choose another service.');}
        setTaxonomyCategories([...taxonomy.roots, ...taxonomy.subcategories]);
        setError("");
      } catch {
        if (active)
          setError("Service types could not be loaded. Please retry.");
      } finally {
        if (active) setTaxonomyLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [serviceId, taxonomyRetry]);

  useEffect(() => {
    let active = true;
    setServiceLoading(Boolean(serviceId));setServiceValid(!serviceId);setServiceName('');setServiceMode(null);
    (async () => {
      try {
        const [profileResult, serviceResult] = await Promise.all([
          getProfile().catch(() => null),
          serviceId
            ? supabase
                .from("services")
                .select("name,delivery_mode")
                .eq("id", serviceId)
                .eq("active", true)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (!active) return;
        if (profileResult?.suburb && profileResult.city && profileResult.state)
          setLocation(current=>addressEdited.current||current.suburb||current.city||current.state?current:({
            ...current,
            suburb: profileResult.suburb ?? "",
            city: profileResult.city ?? "",
            state: profileResult.state ?? "",
            country: profileResult.country?.trim() || "",
            source: "PROFILE",
            confirmed: false,
          }));
        if (serviceId) {
          if (serviceResult.error || !serviceResult.data) {
            setServiceValid(false);
            setError(
              "The selected service is no longer available. Choose another service.",
            );
          } else {
            setServiceName(serviceResult.data.name);
            setServiceMode(serviceResult.data.delivery_mode as DeliveryMode);
            setServiceValid(true);
            if (serviceResult.data.delivery_mode === "REMOTE")
              setMode("REMOTE");
            else if (serviceResult.data.delivery_mode === "LOCAL")
              setMode("LOCAL");
          }
        }
      } finally {
        if (active) setServiceLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [serviceId]);

  async function locateDevice() {
    if (effectiveMode === "REMOTE" || locating || locationLock.current) return;
    locationLock.current = true;
    addressEdited.current = true;
    setLocationAction("DEVICE");
    setError("");
    try {
      const precise = await resolveCustomerServiceLocation();
      if (!precise)
        throw new Error("Precise location is unavailable. Enter the service address manually.");
      setLocation({
        addressLine1: precise.addressLine1,
        suburb: precise.suburb,
        city: precise.city,
        state: precise.state,
        postalCode: precise.postalCode,
        country: precise.country || "",
        formattedAddress: precise.formattedAddress,
        latitude: precise.latitude,
        longitude: precise.longitude,
        accuracy: precise.accuracy ?? undefined,
        source: "DEVICE",
        confirmed: false,
      });
    } catch (e) {
      setError(
        userMessage(e,"Precise location is unavailable. Enter the service address manually."),
      );
    } finally {
      locationLock.current = false;
      setLocationAction(null);
    }
  }

  async function confirmLocation(): Promise<boolean> {
    if (locationLock.current) return false;
    const missing = !location.addressLine1.trim()
      ? {message: "Enter the street address.", input: streetInput}
      : !location.suburb.trim()
        ? {message: "Enter the city or locality.", input: localityInput}
        : !location.state.trim()
          ? {message: "Enter the state or region.", input: regionInput}
          : !location.country.trim()
            ? {message: "Enter the country for this service address.", input: countryInput}
            : null;
    if (missing) {
      locationErrorInput.current = missing.input;
      setError(missing.message);
      missing.input.current?.focus();
      return false;
    }
    locationErrorInput.current = null;
    locationLock.current = true;
    addressEdited.current = true;
    setLocationAction("MANUAL");
    setError("");
    try {
      let next=location;
      if (next.latitude == null || next.longitude == null) {
        const geocoded=await geocodeServiceAddress({
          addressLine1:next.addressLine1,
          suburb:next.suburb,
          city:next.city||next.suburb,
          state:next.state,
          postalCode:next.postalCode,
          country:next.country,
        });
        if(!geocoded)throw new Error("We could not locate that exact address. Check the street address and try again.");
        next={
          addressLine1:geocoded.addressLine1||next.addressLine1,
          suburb:geocoded.suburb||next.suburb,
          city:geocoded.city||next.city||next.suburb,
          state:geocoded.state||next.state,
          postalCode:geocoded.postalCode||next.postalCode,
          country:geocoded.country||next.country,
          formattedAddress:geocoded.formattedAddress,
          latitude:geocoded.latitude,
          longitude:geocoded.longitude,
          accuracy:geocoded.accuracy??undefined,
          source:next.source==="DEVICE"?"DEVICE":"MANUAL",
          confirmed:true,
        };
      } else {
        next={...next,formattedAddress:next.formattedAddress||[next.addressLine1,next.suburb,next.city,next.state,next.postalCode,next.country].filter(Boolean).join(", "),confirmed:true};
      }
      setLocation(next);
      return true;
    } catch(e) {
      setError(userMessage(e,"The service address could not be confirmed."));
      return false;
    } finally {
      locationLock.current = false;
      setLocationAction(null);
    }
  }

  function setManual(field: "addressLine1" | "suburb" | "city" | "state" | "postalCode" | "country", value: string) {
    if (locationLock.current) return;
    addressEdited.current = true;
    setLocation((v) => ({
      ...v,
      [field]: value,
      formattedAddress: "",
      latitude: undefined,
      longitude: undefined,
      accuracy: undefined,
      source: "MANUAL",
      confirmed: false,
    }));
  }
  async function choosePhotos() {
    if(photoPickerLock.current||busy||photos.length>=10)return;
    photoPickerLock.current=true;setPhotoPickerBusy(true);setError('');
    const epoch=photoPickerEpoch.current,owner=draftOwner.current;
    try{
      // Keep browser picker activation in the user's click; native permission is requested on demand.
      if(Platform.OS!=='web'){
        const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
        if(epoch!==photoPickerEpoch.current||owner!==draftOwner.current)return;
        if(!permission.granted){setError('Photo access is required to attach images. You can continue without photos.');return;}
      }
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:Math.max(1,10-photos.length),quality:0.82});
      if(epoch!==photoPickerEpoch.current||owner!==draftOwner.current)return;
      if(!result.canceled)setPhotos(current=>[...current,...result.assets].slice(0,10));
    }catch{if(epoch===photoPickerEpoch.current)setError('Photos could not be opened. Try again or continue without photos.');}
    finally{if(epoch===photoPickerEpoch.current){photoPickerLock.current=false;setPhotoPickerBusy(false)}}
  }
  function chooseDate(kind: "TODAY" | "TOMORROW" | "WEEKEND") {
    const d = kind === "WEEKEND" ? nextSaturday() : new Date();
    if (kind === "TOMORROW") d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    setDate(d);
  }
  function chooseTiming(
    kind:
      "ASAP" | "FLEXIBLE" | "MORNING" | "AFTERNOON" | "EVENING" | "EXACT_TIME",
  ) {
    if (kind === "ASAP" || kind === "FLEXIBLE") {
      setTiming(kind);
      setWindowKey(null);
      setExactTime(null);
    } else if (kind === "EXACT_TIME") {
      setTiming("EXACT_TIME");
      setWindowKey(null);
    } else {
      setTiming("TIME_WINDOW");
      setWindowKey(kind);
      setExactTime(null);
    }
  }
  function budgetValues() {
    if (budgetChoice === "UNDER_100") return { budgetMax: 100 };
    if (budgetChoice === "100_250") return { budgetMin: 100, budgetMax: 250 };
    if (budgetChoice === "250_500") return { budgetMin: 250, budgetMax: 500 };
    if (budgetChoice === "500_PLUS") return { budgetMin: 500 };
    if (budgetChoice === "CUSTOM") {
      const n = Number(customBudget);
      return Number.isFinite(n) && n >= 0 ? { budget: n } : {};
    }
    return {};
  }
  function validate(stage: number) {
    setError("");
    if (serviceId && !serviceValid) {
      setError("The selected service is unavailable.");
      return false;
    }
    if (stage === 1) {
      if (!serviceId && !selectedDefinition) {
        setError("Choose the type of service you need first.");
        return false;
      }
      if (description.trim().length < 5) {
        setError("Tell Everest what you need in a few words.");
        return false;
      }
    }
    if (stage === 2 && effectiveMode === "LOCAL") {
      if (!location.addressLine1.trim()) {
        setError("Add the exact service address before continuing.");
        return false;
      }
      if (!location.confirmed || location.latitude == null || location.longitude == null) {
        setError("Confirm the precise service location before continuing.");
        return false;
      }
    }
    if (stage === 3) {
      if(hasPastRequestedTime({preferredDate:date?localDate(date):undefined,preferredTime:exactTime?timeValue(exactTime):undefined,timingMode:timing})){setError("Choose a future date and time before posting.");return false;}
      if (timing === "EXACT_TIME" && !exactTime) {
        setError("Choose the specific time.");
        return false;
      }
      if (
        budgetChoice === "CUSTOM" &&
        (!customBudget ||
          !Number.isFinite(Number(customBudget)) ||
          Number(customBudget) < 0)
      ) {
        setError("Enter a valid custom budget.");
        return false;
      }
    }
    return true;
  }
  async function next() {
    // A typed address is confirmed (and geocoded) on Continue rather than through a separate button.
    if (step === 2 && effectiveMode !== "REMOTE" && !location.confirmed) {
      if (!(await confirmLocation())) return;
      setStep(3);
      return;
    }
    if (validate(step)) setStep((v) => Math.min(3, v + 1));
  }
  async function clearPostedDraft(){
    draftPaused.current=true;
    await draftSession.current?.clear();
  }
  async function finishPosted(id:string,fromSubmit:boolean){
    let mediaError=!fromSubmit&&expectedPhotoCount>photos.length?'Your request is posted. Photos from the saved draft were not restored. Open Activity to check your request.':'';
    if(fromSubmit&&photos.length){try{await uploadRequestMedia(id,photos,(done,total)=>setUploadProgress(`Uploading ${done}/${total}`))}catch{mediaError='Your request is posted, but some photos could not be attached. Open Activity to view your request.'}}
    if(live){
      setPendingLiveRequestId(id);
      if(!fromSubmit||mediaError){setError(mediaError);return;}
      await startEverestLive(id,arrivalWindow);
      await clearPostedDraft();router.replace(`/everest-live?requestId=${id}`);return;
    }
    await clearPostedDraft().catch(()=>undefined);
    const [statusResult,offersResult]=await Promise.allSettled([
      supabase.from('service_requests').select('status').eq('id',id).single(),
      supabase.from('opportunities').select('id',{count:'exact',head:true}).eq('request_id',id),
    ]);
    const status=statusResult.status==='fulfilled'&&!statusResult.value.error?String(statusResult.value.data?.status??'UNKNOWN'):'UNKNOWN';
    const opportunities=offersResult.status==='fulfilled'&&!offersResult.value.error?offersResult.value.count??0:0;
    setSuccess({id,status,opportunities});setError(mediaError);
  }
  async function checkAttempt(){
    if(!attempt||busy)return;setBusy(true);setError('');
    try{
      const {data,error}=await supabase.from('service_requests').select('id').eq('customer_id',draftOwner.current).eq('request_idempotency_key',attempt.idempotencyKey).maybeSingle();
      if(error)throw error;
      if(data?.id)await finishPosted(data.id,false);
      else setError('Posting has not been confirmed. Retry the same request below; this continues the original request instead of creating another.');
    }catch{setError('Request status is unavailable. Check your connection and try again. Your recovery copy is kept.');}
    finally{setBusy(false)}
  }
  async function submit() {
    if(submitRef.current||busy||photoPickerBusy)return;
    if(missingPhotos>0&&!pendingLiveRequestId){setError('Reattach the photos from your saved request or choose to continue with fewer photos before posting.');return;}
    if(!attempt&&!pendingLiveRequestId&&(!validate(1)||!validate(2)||!validate(3)))return;
    submitRef.current=true;setBusy(true);setError('');
    try{
      if(pendingLiveRequestId){await startEverestLive(pendingLiveRequestId,arrivalWindow);await clearPostedDraft();router.replace(`/everest-live?requestId=${pendingLiveRequestId}`);return;}
      if(attempt){
        if(hasPastRequestedTime(attempt))throw new Error('The requested date has passed. Check request status or Activity before starting a new request.');
        const id=await createServiceRequest(attempt);await finishPosted(id,true);return;
      }
      const win=windowKey?timingWindows[windowKey]:undefined;
      if(!requestIdempotencyKeyRef.current)requestIdempotencyKeyRef.current=createClientIdempotencyKey('service-request');
      const input:NonNullable<RequestDraft['attempt']> = {
        idempotencyKey: requestIdempotencyKeyRef.current,
        categoryId: selectedDefinition?.category_id,
        serviceDefinitionId: selectedDefinition?.id,
        serviceId: serviceId || undefined,
        description: description.trim(),
        deliveryMode:
          selectedDefinition?.default_delivery_mode === "BOTH"
            ? effectiveMode
            : (selectedDefinition?.default_delivery_mode ?? effectiveMode),
        suburb: effectiveMode === "LOCAL" ? location.suburb : undefined,
        city: effectiveMode === "LOCAL" ? location.city : undefined,
        state: effectiveMode === "LOCAL" ? location.state : undefined,
        country: effectiveMode === "LOCAL" ? location.country : undefined,
        addressLine1: effectiveMode === "LOCAL" ? location.addressLine1 : undefined,
        postalCode: effectiveMode === "LOCAL" ? location.postalCode : undefined,
        serviceAddressLabel: effectiveMode === "LOCAL" ? serviceAddressLabel({
          addressLine1:location.addressLine1,suburb:location.suburb,city:location.city,state:location.state,
          postalCode:location.postalCode,country:location.country,formattedAddress:location.formattedAddress,
        }) : undefined,
        latitude: effectiveMode === "LOCAL" ? location.latitude : undefined,
        longitude: effectiveMode === "LOCAL" ? location.longitude : undefined,
        locationAccuracyM:
          effectiveMode === "LOCAL" ? location.accuracy : undefined,
        locationSource: effectiveMode === "REMOTE" ? "REMOTE" : location.source,
        locationConfirmed:
          effectiveMode === "REMOTE" ? true : location.confirmed,
        preferredDate: date ? localDate(date) : undefined,
        preferredTime:
          timing === "EXACT_TIME" && exactTime
            ? timeValue(exactTime)
            : undefined,
        timingMode: timing,
        timeWindowStart: win?.[0],
        timeWindowEnd: win?.[1],
        ...budgetValues(),
      };
      if(!draftSession.current)throw new Error('Draft recovery is unavailable. Please reopen this request and try again.');
      draftPaused.current=true;
      try{await draftSession.current.save({...snapshotRef.current,attempt:input})}catch{draftPaused.current=false;throw new Error('Recovery could not be saved on this device. Keep this page open, enable device storage and retry.');}
      setAttempt(input);
      const id=await createServiceRequest(input);
      await finishPosted(id,true);
    }catch(e){setError(userFacingError(e,'We could not confirm posting. Your request is kept. Check its status or retry the same request.'));}
    finally{setUploadProgress('');setBusy(false);submitRef.current=false;}
  }

  if (success)
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.success}>
          <View style={s.successIcon}>
            <Ionicons name="sparkles" size={28} color={colors.accent} />
          </View>
          <Text style={s.title}>
            Your request is posted.
          </Text>
          <Text style={s.copy}>
            {success.opportunities > 0
              ? `${success.opportunities} eligible business${success.opportunities === 1 ? "" : "es"} are in the first response wave.`
              : "Your request is posted. Everest is checking eligible businesses and service coverage."}
          </Text>
          {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
          <View style={s.progressCard}>
            <ProgressRow done label="Request posted" />
            <ProgressRow
              done={success.status === "QUOTING"}
              label="Matching eligible businesses"
            />
            <ProgressRow done={false} label="Waiting for responses" />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/activity")}
            style={s.primary}
          >
            <Text style={s.primaryText}>View activity</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );

  const photoRecovery=missingPhotos>0?<View style={s.section}>
    <Text accessibilityRole="header" style={s.heading}>Reattach your photos</Text>
    <Text accessibilityLiveRegion="polite" style={s.copy}>{missingPhotos} {missingPhotos===1?'photo needs':'photos need'} to be added again. Your other request details are saved. Images stay out of device draft storage.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Reattach photos" accessibilityState={{disabled:busy||photoPickerBusy,busy:photoPickerBusy}} disabled={busy||photoPickerBusy} onPress={()=>void choosePhotos()} style={s.outline}><Text style={s.outlineText}>{photoPickerBusy?'Opening photos…':'Reattach photos'}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy||photoPickerBusy} onPress={()=>{setExpectedPhotoCount(photos.length);setError('')}} style={s.textButton}><Text style={s.textButtonText}>{photos.length?`Use ${photos.length} attached ${photos.length===1?'photo':'photos'}`:'Continue without photos'}</Text></Pressable>
  </View>:null;

  if(!draftReady||savedDraft||attempt)return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={s.title}>{savedDraft?'Continue your saved request?':attempt?'Check your request status':'Restoring your request…'}</Text>
    {savedDraft?<><Text style={s.copy}>Saved on this device. You can review and edit it before posting. Photos need to be added again after reopening.</Text><Text style={s.heading}>{savedDraft.form.description||'Unfinished service request'}</Text>
      <Pressable accessibilityRole="button" onPress={()=>resumeDraft(savedDraft)} style={s.primary}><Text style={s.primaryText}>Continue saved request</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={()=>void discardDraft()} style={s.textButton}><Text style={s.textButtonText}>Discard saved request and start new</Text></Pressable></>:attempt?<>
      <Text style={s.copy}>Posting was interrupted. Check whether this request was posted before trying again. Retrying continues the original request instead of creating another.</Text>
      {photoRecovery}<Text style={s.heading}>{attempt.description}</Text><Text style={s.copy}>{attempt.serviceAddressLabel||'Remote service'}{attempt.preferredDate?` · Requested date: ${attempt.preferredDate}`:''}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void checkAttempt()} style={s.primary}><Text style={s.primaryText}>Check request status</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void submit()} style={s.outline}><Text style={s.outlineText}>{pendingLiveRequestId?'Continue live search':'Retry posting same request'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={()=>router.replace('/activity')} style={s.textButton}><Text style={s.textButtonText}>View activity</Text></Pressable>
    </>:<ActivityIndicator accessibilityLabel="Restoring saved request"/>}
    {busy?<ActivityIndicator accessibilityLabel="Checking request recovery"/>:null}
    {draftStatus?<Text accessibilityLiveRegion="polite" style={s.copy}>{draftStatus}</Text>:null}
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  </ScrollView></SafeAreaView>;

  const canContinue =
    !busy &&
    !photoPickerBusy &&
    !serviceLoading &&
    serviceValid &&
    (step === 1
      ? Boolean(serviceId || selectedDefinition) &&
        description.trim().length >= 5
      : step === 2
        ? !locating
        : true);
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.header}>
          <View style={s.top}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={step > 1 ? "Previous step" : "Go back"}
              style={s.back}
              disabled={busy || locating}
              onPress={() => (step > 1 ? setStep((v) => v - 1) : router.back())}
            >
              <Ionicons name="chevron-back" size={25} color={colors.text} />
            </Pressable>
            <Text style={s.topTitle}>
              {live ? "Everest Live" : "Post a request"}
            </Text>
            <Text style={s.step}>{step}/3</Text>
          </View>
          <View style={s.bar}>
            <Animated.View
              style={[
                s.barFill,
                {
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
          <View style={s.stepLabels}>
            {["Service", "Location", "Review"].map((label, index) => (
              <Text
                key={label}
                style={[
                  s.stepLabel,
                  { color: step === index + 1 ? colors.accent : colors.muted },
                ]}
              >
                {label}
              </Text>
            ))}
          </View>
        </View>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.page}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
        >
          <Animated.View
            style={{
              opacity: transition,
              transform: [
                {
                  translateY: transition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            }}
          >
            {draftNotice?<Text style={s.copy}>{draftNotice}</Text>:null}
            {photoRecovery}
            <Text style={s.meta}>{draftStatus||'Your request is saved on this device.'} Photos need to be added again after reopening.</Text>
            {step === 1 ? (
              <>
                <Text style={s.title}>What service do you need?</Text>
                <Text style={s.copy}>
                  Search and choose the closest match. Everest uses it to find
                  businesses that actually offer it.
                </Text>
                {!serviceId ? (
                  <ServicePicker
                    onRetry={() => setTaxonomyRetry((value) => value + 1)}
                    services={serviceDefinitions}
                    categories={taxonomyCategories}
                    selected={selectedDefinition}
                    loading={taxonomyLoading}
                    onSelect={(item) => {
                      restoredDefinition.current='';setSelectedDefinition(item);
                      if (item.default_delivery_mode !== "BOTH")
                        setMode(item.default_delivery_mode);
                    }}
                  />
                ) : serviceLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <View style={s.selected}>
                    <Text style={s.eyebrow}>Selected service</Text>
                    <Text style={s.selectedName}>{serviceName}</Text>
                  </View>
                )}
                {serviceId || selectedDefinition ? (
                  <>
                    <Text style={s.heading}>Tell them what you need</Text>
                    <Text style={s.meta}>
                      A short description helps businesses quote accurately.
                    </Text>
                    <TextInput
                      onFocus={()=>setDetailsFocused(true)}
                  onBlur={()=>setDetailsFocused(false)}
                  accessibilityLabel="Job details"
                      value={description}
                      onChangeText={setDescription}
                      placeholder={detailsExample(selectedDefinition?.name)}
                      placeholderTextColor={colors.muted}
                      multiline
                      maxLength={5000}
                      style={[s.input, s.area, detailsFocused&&{borderColor:colors.brand},Platform.OS==='web'?({outlineStyle:'none',outlineWidth:0} as never):null]}
                    />
                    <Text style={s.meta}>
                      Add useful details like size, urgency, condition or
                      access.
                    </Text>
                  </>
                ) : null}
                {definitionMode === "BOTH" ? (
                  <View style={s.chips}>
                    <Chip
                      active={mode === "LOCAL"}
                      text="Local"
                      onPress={() => setMode("LOCAL")}
                      colors={colors}
                    />
                    <Chip
                      active={mode === "REMOTE"}
                      text="Remote"
                      onPress={() => setMode("REMOTE")}
                      colors={colors}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            {step === 2 ? (
              <>
                <Text style={s.title}>Where do you need it?</Text>
                <Text style={s.copy}>
                  {effectiveMode === "REMOTE"
                    ? "This service can be delivered online."
                    : "Use the exact address where the business should arrive. Everest uses it for distance, matching and ETA."}
                </Text>
                {effectiveMode === "LOCAL" ? (
                  <View>
                    {location.suburb ? (
                      <View style={s.locationCard}>
                        <Ionicons
                          name="location"
                          size={21}
                          color={colors.accent}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={s.locationName}>
                            {location.formattedAddress || [location.addressLine1,location.suburb,location.state,location.postalCode,location.country].filter(Boolean).join(", ")}
                          </Text>
                          <Text style={s.meta}>
                            {location.source === "DEVICE"
                              ? "Precise device location"
                              : location.source === "PROFILE"
                                ? "Area from your profile — add the street address below"
                                : "Exact address entered manually"}
                            {location.country ? ` · ${location.country}` : ""}
                            {location.accuracy!=null?` · ±${Math.max(1,Math.round(location.accuracy))} m`:""}
                          </Text>
                        </View>
                        {location.confirmed ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={23}
                            color={colors.accent}
                          />
                        ) : null}
                      </View>
                    ) : null}
                    {!location.confirmed ? (
                      <>
                        <View style={s.row}>
                          <Pressable
                            accessibilityRole="button"
                            disabled={locating}
                            accessibilityState={{disabled:locating,busy:locationAction==="DEVICE"}}
                            onPress={() => void locateDevice()}
                            style={[s.primarySmall, locating && s.disabled]}
                          >
                            <Ionicons
                              name="navigate-outline"
                              size={16}
                              color={colors.onBrand}
                            />
                            <Text style={s.primaryText}>
                              {locationAction === "DEVICE" ? "Finding your location…" : "Use precise location"}
                            </Text>
                          </Pressable>
                          {location.suburb ? (
                            <Pressable
                              accessibilityRole="button"
                              disabled={locating}
                              onPress={() => void confirmLocation()}
                              style={s.outlineSmall}
                            >
                              <Text style={s.outlineText}>
                                Confirm this address
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <Text style={s.or}>Or enter the service address</Text>
                        <Text style={s.heading}>Street address</Text>
                        <TextInput
                          ref={streetInput}
                          editable={!locating}
                          value={location.addressLine1}
                          onChangeText={(v) => setManual("addressLine1", v)}
                          accessibilityLabel="Street address"
                          placeholder="Street address (for example 12 Railway St)"
                          placeholderTextColor={colors.muted}
                          autoCapitalize="words"
                          style={s.input}
                        />
                        <Text style={s.heading}>City or locality</Text>
                        <TextInput
                          ref={localityInput}
                          editable={!locating}
                          value={location.suburb}
                          onChangeText={(v) => setManual("suburb", v)}
                          accessibilityLabel="City or locality"
                          placeholder="City, town or suburb"
                          placeholderTextColor={colors.muted}
                          style={s.input}
                        />
                        <Text style={s.heading}>Country</Text>
                        <TextInput ref={countryInput} editable={!locating} value={location.country}
                          onChangeText={(v) => setManual("country", v)} accessibilityLabel="Country"
                          placeholder="Country" placeholderTextColor={colors.muted} autoCapitalize="words" style={s.input}/>
                        <Text style={s.heading}>State or region</Text>
                        <TextInput ref={regionInput} editable={!locating} value={location.state}
                          onChangeText={(v) => setManual("state", v)} accessibilityLabel="State or region"
                          placeholder="State or region" placeholderTextColor={colors.muted} autoCapitalize="words" style={s.input}/>
                        <Text style={s.heading}>City (optional)</Text>
                        <TextInput editable={!locating} value={location.city} onChangeText={(v) => setManual("city", v)}
                          accessibilityLabel="City (optional)" placeholder="For a more specific locality" placeholderTextColor={colors.muted} style={s.input}/>
                        <Text style={s.heading}>Postal code (optional)</Text>
                        <TextInput editable={!locating} value={location.postalCode} onChangeText={(v) => setManual("postalCode", v)}
                          accessibilityLabel="Postal code (optional)" placeholder="Postal code" autoCapitalize="characters" placeholderTextColor={colors.muted} style={s.input}/>
                        {location.addressLine1 && location.suburb && location.state && location.country ? (
                          <Pressable
                            accessibilityRole="button"
                            disabled={locating}
                            onPress={() => void confirmLocation()}
                            style={s.outline}
                          >
                            <Text style={s.outlineText}>{locationAction==="MANUAL"?"Locating address…":"Confirm precise address"}</Text>
                          </Pressable>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <View style={s.locationPrivacy}>
                          <Ionicons name="shield-checkmark-outline" size={17} color={colors.accent}/>
                          <Text style={s.locationPrivacyText}>Everest uses the precise pin for matching and ETA. Businesses see distance/ETA while deciding; the exact service address is reserved for the selected booking.</Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            setLocation((v) => ({ ...v, confirmed: false }))
                          }
                          style={s.textButton}
                        >
                          <Text style={s.textButtonText}>Change location</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                ) : (
                  <View style={s.remote}>
                    <Ionicons
                      name="globe-outline"
                      size={20}
                      color={colors.accent}
                    />
                    <Text style={s.meta}>
                      Remote request — no GPS or local address is required.
                    </Text>
                  </View>
                )}
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Text style={s.title}>
                  {live ? "How soon do you need it?" : "When do you need it?"}
                </Text>
                <Text style={s.copy}>
                  {live
                    ? "This is your requested arrival window, not a guaranteed arrival time. Businesses confirm timing in their response."
                    : "This is a preference until a business confirms its quote."}
                </Text>
                {live ? (
                  <View style={s.optionGrid}>
                    {(
                      [
                        ["ASAP", "ASAP", "First available"],
                        [
                          "WITHIN_30_MINUTES",
                          "Within 30 minutes",
                          "Requested window",
                        ],
                        ["WITHIN_1_HOUR", "Within 1 hour", "Requested window"],
                        ["TODAY", "Today", "Any time today"],
                      ] as const
                    ).map(([key, title, sub]) => (
                      <Pressable
                        accessibilityRole="button"
                        key={key}
                        onPress={() => {
                          setArrivalWindow(key);
                          setTiming("ASAP");
                          setDate(new Date());
                        }}
                        style={[
                          s.option,
                          arrivalWindow === key && s.optionActive,
                        ]}
                      >
                        <Text style={s.optionTitle}>{title}</Text>
                        <Text style={s.meta}>{sub}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <>
                    <View style={s.quickRow}>
                      <Chip
                        active={
                          date
                            ? localDate(date) === localDate(new Date())
                            : false
                        }
                        text="Today"
                        onPress={() => chooseDate("TODAY")}
                        colors={colors}
                      />
                      <Chip
                        active={false}
                        text="Tomorrow"
                        onPress={() => chooseDate("TOMORROW")}
                        colors={colors}
                      />
                      <Chip
                        active={false}
                        text="This weekend"
                        onPress={() => chooseDate("WEEKEND")}
                        colors={colors}
                      />
                    </View>
                    <DateTimeField
                      mode="date"
                      value={date}
                      onChange={setDate}
                      minimumDate={new Date()}
                      label="Pick a date"
                    />
                  </>
                )}
                {!live ? (
                  <>
                    <Text style={s.heading}>Time</Text>
                    <View style={s.optionGrid}>
                      {[
                        ["ASAP", "As soon as possible", "First available"],
                        ["FLEXIBLE", "Anytime", "Flexible"],
                        ["MORNING", "Morning", "8 AM – 12 PM"],
                        ["AFTERNOON", "Afternoon", "12 PM – 5 PM"],
                        ["EVENING", "Evening", "5 PM – 9 PM"],
                        ["EXACT_TIME", "Specific time", "Choose a time"],
                      ].map(([key, title, sub]) => (
                        <Pressable
                          accessibilityRole="button"
                          key={key}
                          onPress={() =>
                            chooseTiming(
                              key as
                                | "ASAP"
                                | "FLEXIBLE"
                                | "MORNING"
                                | "AFTERNOON"
                                | "EVENING"
                                | "EXACT_TIME",
                            )
                          }
                          style={[
                            s.option,
                            (timing === key || windowKey === key) &&
                              s.optionActive,
                          ]}
                        >
                          <Text style={s.optionTitle}>{title}</Text>
                          <Text style={s.meta}>{sub}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {timing === "EXACT_TIME" ? (
                      <DateTimeField
                        mode="time"
                        value={exactTime}
                        onChange={setExactTime}
                        label="Choose specific time"
                      />
                    ) : null}
                  </>
                ) : null}
                <Text onLayout={event=>{budgetY.current=event.nativeEvent.layout.y}} style={s.heading}>
                  Budget <Text style={s.optional}>(optional)</Text>
                </Text>
                <View style={s.chips}>
                  {[
                    ["NONE", "No budget yet"],
                    ["UNDER_100", "Under $100"],
                    ["100_250", "$100–250"],
                    ["250_500", "$250–500"],
                    ["500_PLUS", "$500+"],
                    ["CUSTOM", "Custom"],
                  ].map(([key, label]) => (
                    <Chip
                      key={key}
                      active={budgetChoice === key}
                      text={label}
                      onPress={() => setBudgetChoice(key as BudgetChoice)}
                      colors={colors}
                    />
                  ))}
                </View>
                {budgetChoice === "CUSTOM" ? (
                  <TextInput
                    value={customBudget}
                    onChangeText={setCustomBudget}
                    placeholder="Custom budget AUD"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    style={s.input}
                  />
                ) : null}
                <View onLayout={event=>{photosY.current=event.nativeEvent.layout.y}} style={s.section}>
                  <Text style={s.heading}>
                    Add photos <Text style={s.optional}>(optional)</Text>
                  </Text>
                  <Text style={s.meta}>
                    Photos help businesses understand the job before quoting.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={photos.length?`Add photos (${photos.length}/10)`:"Add photos"}
                    disabled={photoPickerBusy||busy||photos.length>=10}
                    accessibilityState={{disabled:photoPickerBusy||busy||photos.length>=10,busy:photoPickerBusy}}
                    onPress={() => void choosePhotos()}
                    style={s.outline}
                  >
                    <Ionicons
                      name="images-outline"
                      size={17}
                      color={colors.text}
                    />
                    <Text style={s.outlineText}>
                      Add photos {photos.length ? `(${photos.length}/10)` : ""}
                    </Text>
                  </Pressable>
                  {photos.length ? (
                    <ScrollView horizontal contentContainerStyle={s.photoRow}>
                      {photos.map((p, i) => (
                        <View key={p.assetId ?? p.uri} style={s.photoWrap}>
                          <Image source={{ uri: p.uri }} style={s.photo} />
                          <Pressable accessibilityLabel={`Remove photo ${i+1}`}
                            accessibilityRole="button"
                            onPress={() => {
                              setExpectedPhotoCount(count=>Math.max(0,count-1));
                              setPhotos(items=>items.filter((_,index)=>index!==i));
                            }}
                            style={s.remove}
                          >
                            <Ionicons name="close" size={14} color="#fff" />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
                <Text style={s.heading}>Your request</Text>
                <Text style={s.copy}>
                  Tap any row to edit it before Everest starts matching.
                </Text>
                <Review
                  label="Service type"
                  value={
                    serviceName || selectedDefinition?.name || "Not selected"
                  }
                  onPress={() => setStep(1)}
                  colors={colors}
                />
                <Review
                  label="Job details"
                  value={description}
                  onPress={() => setStep(1)}
                  colors={colors}
                />
                <Review
                  label="Where"
                  value={
                    effectiveMode === "REMOTE"
                      ? "Remote / online"
                      : serviceAddressLabel({addressLine1:location.addressLine1,suburb:location.suburb,city:location.city,state:location.state,postalCode:location.postalCode,country:location.country,formattedAddress:location.formattedAddress})
                  }
                  onPress={() => setStep(2)}
                  colors={colors}
                />
                <Review
                  label="When"
                  value={
                    live
                      ? arrivalWindow.replaceAll("_", " ").toLowerCase()
                      : date
                        ? `${date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })} · ${timing === "TIME_WINDOW" ? (windowKey?.toLowerCase() ?? "Flexible") : timing === "EXACT_TIME" && exactTime ? exactTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : timing === "ASAP" ? "As soon as possible" : "Flexible"}`
                        : "Flexible date · " +
                          (timing === "ASAP"
                            ? "ASAP"
                            : timing === "FLEXIBLE"
                              ? "Anytime"
                              : (windowKey?.toLowerCase() ?? "Flexible"))
                  }
                  onPress={() =>
                    scrollRef.current?.scrollTo({ y: 0, animated: !reduced })
                  }
                  colors={colors}
                />
                <Review
                  label="Budget"
                  value={
                    budgetChoice === "NONE"
                      ? "Not specified"
                      : budgetChoice === "CUSTOM"
                        ? `$${customBudget} AUD`
                        : budgetChoice
                            .replace("_", "–")
                            .replace("UNDER–100", "Under $100")
                            .replace("100–250", "$100–250")
                            .replace("250–500", "$250–500")
                            .replace("500–PLUS", "$500+")
                  }
                  onPress={() =>
                    scrollRef.current?.scrollTo({ y: budgetY.current, animated: !reduced })
                  }
                  colors={colors}
                />
                {photos.length ? (
                  <Review
                    label="Photos"
                    value={`${photos.length} attached`}
                    onPress={() =>
                      scrollRef.current?.scrollTo({ y: photosY.current, animated: !reduced })
                    }
                    colors={colors}
                  />
                ) : null}
              </>
            ) : null}

            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
            {uploadProgress ? (
              <Text style={s.meta}>{uploadProgress}</Text>
            ) : null}
          </Animated.View>
        </ScrollView>
        <View style={s.footer}>
          {step < 3 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canContinue }}
              disabled={!canContinue}
              onPress={() => void next()}
              style={({ pressed }) => [
                s.primary,
                {
                  flex: 1,
                  transform: [{ scale: pressed && !reduced ? 0.98 : 1 }],
                },
                !canContinue && s.primaryDisabled,
              ]}
            >
              <Text style={[s.primaryText, !canContinue && s.primaryTextDisabled]}>Continue</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void submit()}
              style={[s.primary, { flex: 1 }, busy && s.disabled]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={s.primaryText}>
                  {live
                    ? pendingLiveRequestId
                      ? "Retry live search"
                      : "Start live search"
                    : "Post request"}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function Chip({
  active,
  text,
  onPress,
  colors,
}: {
  active: boolean;
  text: string;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 13,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: active ? colors.brand : colors.border,
        backgroundColor: active ? colors.soft : colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "900", color: colors.text }}>
        {text}
      </Text>
    </Pressable>
  );
}
function Review({
  label,
  value,
  onPress,
  colors,
}: {
  label: string;
  value: string;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label.toLowerCase()}`}
      onPress={onPress}
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 16,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "900",
            color: colors.muted,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            lineHeight: 20,
            color: colors.text,
            marginTop: 5,
          }}
        >
          {value}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: "700", color:colors.accent }}>
        Edit
      </Text>
    </Pressable>
  );
}
function ProgressRow({ done, label }: { done: boolean; label: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        marginTop: 10,
      }}
    >
      <Ionicons
        name={done ? "checkmark-circle" : "ellipse-outline"}
        size={18}
        color={done ? colors.accent : colors.muted}
      />
      <Text style={{ fontSize: 12, color: colors.text }}>{label}</Text>
    </View>
  );
}
const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    page: {
      paddingHorizontal: 22,
      paddingBottom: 32,
      maxWidth: 640,
      width: "100%",
      alignSelf: "center",
      flexGrow: 1,
    },
    header: {
      paddingHorizontal: 22,
      paddingTop: 4,
      maxWidth: 640,
      width: "100%",
      alignSelf: "center",
    },
    back: { minWidth: 44, minHeight: 44, justifyContent: "center" },
    stepLabels: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 10,
      marginBottom: 6,
    },
    stepLabel: { fontSize: 14, fontWeight: "700" },
    top: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topTitle: { fontSize: 16, fontWeight: "900", color: c.text },
    step: {
      minWidth: 44,
      textAlign: "right",
      fontSize: 12,
      fontWeight: "900",
      color: c.muted,
    },
    bar: {
      height: 4,
      backgroundColor: c.border,
      borderRadius: 4,
      overflow: "hidden",
      marginTop: 16,
    },
    barFill: { height: 4, backgroundColor: c.brand },
    selected: {
      backgroundColor: c.soft,
      borderRadius: 15,
      padding: 13,
      marginTop: 16,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: "900",
      color: c.muted,
    },
    selectedName: {
      fontSize: 14,
      fontWeight: "900",
      color: c.text,
      marginTop: 4,
    },
    title: {
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: -1,
      color: c.text,
      marginTop: 26,
    },
    copy: {
      fontSize: 14,
      lineHeight: 22,
      color: c.textSecondary,
      marginTop: 7,
      marginBottom: 18,
    },
    input: {
      minHeight: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.input,
      color: c.text,
      paddingHorizontal: 14,
      fontSize: 16,
      marginTop: 9,
    },
    area: {outlineWidth:0, minHeight: 150, paddingTop: 14, textAlignVertical: "top" },
    section: { marginTop: 22 },
    heading: {
      fontSize: 17,
      fontWeight: "900",
      color: c.text,
      marginTop: 20,
      marginBottom: 10,
    },
    optional: { fontSize: 12, fontWeight: "600", color: c.muted },
    locationCard: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 17,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    locationName: { fontSize: 15, lineHeight: 20, fontWeight: "900", color: c.text },
    locationPrivacy:{marginTop:10,borderRadius:14,backgroundColor:c.soft,padding:12,flexDirection:"row",gap:8,alignItems:"flex-start"},
    locationPrivacyText:{flex:1,fontSize:12,lineHeight:17,color:c.textSecondary},
    meta: { fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 3 },
    row: { flexDirection: "column", gap: 9, marginTop: 9 },
    primarySmall: {
      minHeight: 46,
      borderRadius: 13,
      backgroundColor: c.brand,
      paddingHorizontal: 14,
      flexDirection: "row",
      gap: 7,
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
    },
    outlineSmall: {
      minHeight: 46,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
    },
    or: {
      fontSize: 12,
      fontWeight: "900",
      color: c.muted,
      textAlign: "center",
      marginTop: 17,
    },
    outline: {
      minHeight: 48,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 11,
      paddingHorizontal: 14,
    },
    outlineText: { fontSize: 12, fontWeight: "900", color: c.text },
    textButton: {
      alignSelf: "flex-start",
      minHeight: 44,
      justifyContent: "center",
      paddingVertical: 10,
    },
    textButtonText: { fontSize: 14, fontWeight: "900", color:c.accent },
    remote: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 15,
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
      marginTop: 10,
    },
    quickRow: {
      flexDirection: "row",
      gap: 7,
      flexWrap: "wrap",
      marginBottom: 10,
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginVertical: 10,
    },
    optionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 10,
    },
    option: {
      width: "48.5%",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 15,
      backgroundColor: c.surface,
      padding: 13,
      minHeight: 70,
    },
    optionActive: { borderColor: c.brand, backgroundColor: c.soft },
    optionTitle: { fontSize: 12, fontWeight: "900", color: c.text },
    photoRow: { gap: 8, paddingVertical: 10 },
    photoWrap: {
      width: 78,
      height: 78,
      borderRadius: 13,
      overflow: "hidden",
      position: "relative",
    },
    photo: { width: 78, height: 78 },
    remove: {
      position: "absolute",
      right: 4,
      top: 4,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,.7)",
      alignItems: "center",
      justifyContent: "center",
    },
    error: { fontSize: 14, lineHeight: 20, color: c.danger, marginTop: 13 },
    footer: {
      flexDirection: "row",
      paddingHorizontal: 22,
      paddingTop: 12,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.canvas,
      maxWidth: 640,
      width: "100%",
      alignSelf: "center",
    },
    primary: {
      minHeight: 54,
      borderRadius: 15,
      backgroundColor: c.brand,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    primaryText: {
      fontSize: 14,
      fontWeight: "900",
      color: c.onBrand,
    },
    disabled: { opacity: 0.5 },
    primaryDisabled: { backgroundColor: c.disabled },
    primaryTextDisabled: { color: c.onDisabled },
    success: {
      flex: 1,
      padding: 28,
      justifyContent: "center",
      maxWidth: 600,
      width: "100%",
      alignSelf: "center",
    },
    successIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.soft,
      alignItems: "center",
      justifyContent: "center",
    },
    progressCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 18,
      padding: 16,
      marginVertical: 14,
    },
  });
