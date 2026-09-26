import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { ServicePicker } from "@/components/ServicePicker";
import { useReducedMotion } from "@/lib/motion";
import { DateTimeField } from "@/components/DateTimeField";
import {
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

type LocationValue = {
  suburb: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  source: LocationSource;
  confirmed: boolean;
  geocoder?: "DEVICE" | "OSM";
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

async function reverseGeocodeWebFallback(latitude: number, longitude: number) {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "16",
      addressdetails: "1",
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      address?: Record<string, string | undefined>;
    };
    const address = payload.address ?? {};
    const suburb = (
      address.suburb ||
      address.neighbourhood ||
      address.quarter ||
      address.city_district ||
      address.town ||
      address.village ||
      ""
    ).trim();
    const city = (
      address.city ||
      address.town ||
      address.municipality ||
      address.county ||
      suburb
    ).trim();
    const state = (address.state || address.state_district || "").trim();
    return suburb && city && state ? { suburb, city, state } : null;
  } catch {
    return null;
  }
}

export default function Request() {
  const { colors } = useAppTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const params = useLocalSearchParams<{
    serviceId?: string;
    mode?: string;
    live?: string;
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
    suburb: "",
    city: "",
    state: "",
    source: "MANUAL",
    confirmed: false,
  });
  const [locating, setLocating] = useState(false);
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

  useEffect(()=>{if(error)scrollRef.current?.scrollToEnd({animated:!reduced})},[error,reduced]);

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
          setLocation(current=>current.suburb||current.city||current.state?current:({
            suburb: profileResult.suburb ?? "",
            city: profileResult.city ?? "",
            state: profileResult.state ?? "",
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
    if (effectiveMode === "REMOTE" || locating) return;
    setLocating(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Location permission was not granted. You can enter the suburb manually.",
        );
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      let named: { suburb: string; city: string; state: string } | null = null;
      let geocoder: "DEVICE" | "OSM" = "DEVICE";
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
        const place = places[0];
        if (place) {
          const suburb = (
            place.district ||
            place.subregion ||
            place.city ||
            ""
          ).trim();
          const city = (place.city || place.subregion || suburb).trim();
          const state = (place.region || "").trim();
          if (suburb && city && state) named = { suburb, city, state };
        }
      } catch {
        /* Web/PWA fallback below handles reverse-geocode failures. */
      }
      if (!named && Platform.OS === "web") {
        named = await reverseGeocodeWebFallback(
          current.coords.latitude,
          current.coords.longitude,
        );
        if (named) geocoder = "OSM";
      }
      if (!named)
        throw new Error(
          "We found your position but could not name the area. Enter it manually.",
        );
      setLocation({
        ...named,
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy ?? undefined,
        source: "DEVICE",
        confirmed: false,
        geocoder,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Location is unavailable. Enter your suburb manually.",
      );
    } finally {
      setLocating(false);
    }
  }
  function confirmLocation() {
    if (
      !location.suburb.trim() ||
      !location.city.trim() ||
      !location.state.trim()
    ) {
      setError("Add suburb, city and state first.");
      return;
    }
    setLocation((v) => ({
      ...v,
      source:
        v.source === "DEVICE" || v.source === "PROFILE" ? v.source : "MANUAL",
      confirmed: true,
    }));
    setError("");
  }
  function setManual(field: "suburb" | "city" | "state", value: string) {
    setLocation((v) => ({
      ...v,
      [field]: value,
      latitude: undefined,
      longitude: undefined,
      accuracy: undefined,
      source: "MANUAL",
      confirmed: false,
    }));
  }
  async function choosePhotos() {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo access is required to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 10 - photos.length),
      quality: 0.82,
    });
    if (!result.canceled)
      setPhotos((current) => [...current, ...result.assets].slice(0, 10));
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
    if (stage === 2 && effectiveMode === "LOCAL" && !location.confirmed) {
      setError("Confirm the service location before continuing.");
      return false;
    }
    if (stage === 3) {
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
  function next() {
    if (validate(step)) setStep((v) => Math.min(3, v + 1));
  }
  async function submit() {
    if (
      submitRef.current ||
      busy ||
      !validate(1) ||
      !validate(2) ||
      !validate(3)
    )
      return;
    submitRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (live && pendingLiveRequestId) {
        try {
          await startEverestLive(pendingLiveRequestId, arrivalWindow);
          const id = pendingLiveRequestId;
          setPendingLiveRequestId(null);
          router.replace(`/everest-live?requestId=${id}`);
          return;
        } catch (e) {
          setError(
            userFacingError(
              e,
              "Your request is already posted, but Everest Live could not start. Please retry.",
            ),
          );
          return;
        }
      }
      const win = windowKey ? timingWindows[windowKey] : undefined;
      const id = await createServiceRequest({
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
      });
      if (photos.length) {
        setUploadProgress(`Uploading 0/${photos.length}`);
        await uploadRequestMedia(id, photos, (done, total) =>
          setUploadProgress(`Uploading ${done}/${total}`),
        );
      }
      if (live) {
        try {
          await startEverestLive(id, arrivalWindow);
          router.replace(`/everest-live?requestId=${id}`);
          return;
        } catch (e) {
          setPendingLiveRequestId(id);
          setError(
            userFacingError(
              e,
              "Your request is posted, but Everest Live could not start. Tap Retry Live Search.",
            ),
          );
          return;
        }
      }
      const [requestResult, oppResult] = await Promise.all([
        supabase
          .from("service_requests")
          .select("status")
          .eq("id", id)
          .single(),
        supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true })
          .eq("request_id", id),
      ]);
      setSuccess({
        id,
        status: String(requestResult.data?.status ?? "OPEN"),
        opportunities: oppResult.count ?? 0,
      });
    } catch (e) {
      setError(
        userFacingError(e, "We could not post your request. Please retry."),
      );
    } finally {
      setUploadProgress("");
      setBusy(false);
      submitRef.current = false;
    }
  }

  if (success)
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.success}>
          <View style={s.successIcon}>
            <Ionicons name="sparkles" size={28} color={colors.brand} />
          </View>
          <Text style={s.title}>
            We’re finding the best businesses near you.
          </Text>
          <Text style={s.copy}>
            {success.opportunities > 0
              ? `${success.opportunities} eligible business${success.opportunities === 1 ? "" : "es"} are in the first response wave.`
              : "Your request is posted. Everest is checking eligible businesses and service coverage."}
          </Text>
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
            <Text style={s.primaryText}>VIEW ACTIVITY</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );

  const canContinue =
    !busy &&
    !serviceLoading &&
    serviceValid &&
    (step === 1
      ? Boolean(serviceId || selectedDefinition) &&
        description.trim().length >= 5
      : step === 2
        ? effectiveMode === "REMOTE" || location.confirmed
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
              disabled={busy}
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
                  { color: step === index + 1 ? colors.brand : colors.muted },
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
          keyboardDismissMode="on-drag"
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
                      setSelectedDefinition(item);
                      if (item.default_delivery_mode !== "BOTH")
                        setMode(item.default_delivery_mode);
                    }}
                  />
                ) : serviceLoading ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <View style={s.selected}>
                    <Text style={s.eyebrow}>SELECTED SERVICE</Text>
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
                      placeholder="For example: Interior and exterior detail for a sedan. The seats need deep cleaning."
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
                    : "Choose the area where the work will take place."}
                </Text>
                {effectiveMode === "LOCAL" ? (
                  <View>
                    {location.suburb ? (
                      <View style={s.locationCard}>
                        <Ionicons
                          name="location"
                          size={21}
                          color={colors.brand}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={s.locationName}>
                            {location.suburb}, {location.state}
                          </Text>
                          <Text style={s.meta}>
                            {location.source === "DEVICE"
                              ? location.geocoder === "OSM"
                                ? "Based on your device location · © OpenStreetMap contributors"
                                : "Based on your device location"
                              : location.source === "PROFILE"
                                ? "From your profile"
                                : "Entered manually"}
                          </Text>
                        </View>
                        {location.confirmed ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={23}
                            color={colors.brand}
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
                            onPress={() => void locateDevice()}
                            style={[s.primarySmall, locating && s.disabled]}
                          >
                            <Ionicons
                              name="navigate-outline"
                              size={16}
                              color={colors.onBrand}
                            />
                            <Text style={s.primaryText}>
                              {locating ? "LOCATING…" : "USE MY LOCATION"}
                            </Text>
                          </Pressable>
                          {location.suburb ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={confirmLocation}
                              style={s.outlineSmall}
                            >
                              <Text style={s.outlineText}>
                                USE THIS LOCATION
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <Text style={s.or}>OR CHANGE MANUALLY</Text>
                        <TextInput
                          value={location.suburb}
                          onChangeText={(v) => setManual("suburb", v)}
                          accessibilityLabel="Suburb"
                          placeholder="Suburb"
                          placeholderTextColor={colors.muted}
                          style={s.input}
                        />
                        <View style={s.row}>
                          <TextInput
                            value={location.city}
                            onChangeText={(v) => setManual("city", v)}
                            accessibilityLabel="City"
                            placeholder="City"
                            placeholderTextColor={colors.muted}
                            style={[s.input, { flex: 1 }]}
                          />
                          <TextInput
                            value={location.state}
                            onChangeText={(v) => setManual("state", v)}
                            accessibilityLabel="State"
                            placeholder="State"
                            placeholderTextColor={colors.muted}
                            style={[s.input, { flex: 1 }]}
                          />
                        </View>
                        {location.suburb && location.city && location.state ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={confirmLocation}
                            style={s.outline}
                          >
                            <Text style={s.outlineText}>CONFIRM LOCATION</Text>
                          </Pressable>
                        ) : null}
                      </>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          setLocation((v) => ({ ...v, confirmed: false }))
                        }
                        style={s.textButton}
                      >
                        <Text style={s.textButtonText}>CHANGE LOCATION</Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  <View style={s.remote}>
                    <Ionicons
                      name="globe-outline"
                      size={20}
                      color={colors.brand}
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
                    onPress={() => void choosePhotos()}
                    style={s.outline}
                  >
                    <Ionicons
                      name="images-outline"
                      size={17}
                      color={colors.text}
                    />
                    <Text style={s.outlineText}>
                      ADD PHOTOS {photos.length ? `(${photos.length}/10)` : ""}
                    </Text>
                  </Pressable>
                  {photos.length ? (
                    <ScrollView horizontal contentContainerStyle={s.photoRow}>
                      {photos.map((p, i) => (
                        <View key={p.assetId ?? p.uri} style={s.photoWrap}>
                          <Image source={{ uri: p.uri }} style={s.photo} />
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              setPhotos((items) =>
                                items.filter((_, index) => index !== i),
                              )
                            }
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
                  label="SERVICE TYPE"
                  value={
                    serviceName || selectedDefinition?.name || "Not selected"
                  }
                  onPress={() => setStep(1)}
                  colors={colors}
                />
                <Review
                  label="JOB DETAILS"
                  value={description}
                  onPress={() => setStep(1)}
                  colors={colors}
                />
                <Review
                  label="WHERE"
                  value={
                    effectiveMode === "REMOTE"
                      ? "Remote / online"
                      : `${location.suburb}, ${location.city}, ${location.state}`
                  }
                  onPress={() => setStep(2)}
                  colors={colors}
                />
                <Review
                  label="WHEN"
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
                  label="BUDGET"
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
                    label="PHOTOS"
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
              onPress={next}
              style={({ pressed }) => [
                s.primary,
                {
                  flex: 1,
                  transform: [{ scale: pressed && !reduced ? 0.98 : 1 }],
                },
                !canContinue && s.disabled,
              ]}
            >
              <Text style={s.primaryText}>CONTINUE</Text>
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
                      ? "RETRY LIVE SEARCH"
                      : "START LIVE SEARCH"
                    : "POST REQUEST"}
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
      <Text style={{ fontSize: 10, fontWeight: "900", color: colors.text }}>
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
            fontSize: 9,
            fontWeight: "900",
            letterSpacing: 1,
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
      <Text style={{ fontSize: 10, fontWeight: "900", color: colors.brand }}>
        EDIT
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
        color={done ? colors.brand : colors.muted}
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
    stepLabel: { fontSize: 11, fontWeight: "700" },
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
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.2,
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
    optional: { fontSize: 11, fontWeight: "600", color: c.muted },
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
    locationName: { fontSize: 15, fontWeight: "900", color: c.text },
    meta: { fontSize: 11, lineHeight: 17, color: c.muted, marginTop: 3 },
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
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1,
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
    outlineText: { fontSize: 11, fontWeight: "900", color: c.text },
    textButton: {
      alignSelf: "flex-start",
      minHeight: 44,
      justifyContent: "center",
      paddingVertical: 10,
    },
    textButtonText: { fontSize: 10, fontWeight: "900", color: c.brand },
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
    error: { fontSize: 12, lineHeight: 18, color: c.danger, marginTop: 13 },
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
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.6,
      color: c.onBrand,
    },
    disabled: { opacity: 0.5 },
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
