import { useMemo, useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ServiceDefinition, TaxonomyCategory } from "@/lib/taxonomy";
import { useAppTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";
import { haptic } from "@/lib/haptics";

// Search only ranks existing definitions; it never invents IDs or services.
export function ServicePicker({
  services,
  categories,
  selected,
  loading,
  onSelect,
  onRetry,
}: {
  services: ServiceDefinition[];
  categories: TaxonomyCategory[];
  selected: ServiceDefinition | null;
  loading: boolean;
  onRetry: () => void;
  onSelect: (service: ServiceDefinition) => void;
}) {
  const { colors: c } = useAppTheme();
  const reduced = useReducedMotion();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  const reveal = useRef(new Animated.Value(1)).current;
  const byId = useMemo(
    () =>
      Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return services
      .map((service) => {
        const category = byId[service.category_id];
        const name = service.name.toLowerCase();
        const searchable = [
          name,
          service.slug,
          service.description,
          category?.name,
          category?.parent_id ? byId[category.parent_id]?.name : "",
        ]
          .join(" ")
          .toLowerCase()
          .replace(/-/g, " ");
        const words = q.split(/\s+/);
        const related =
          (q.includes("detail") &&
            /ceramic coating|paint correction/.test(name)) ||
          ((q === "website" || q === "websites") &&
            /web development|web design/.test(name)) ||
          (q === "plumber" && name.includes("plumbing")) ||
          ((q === "cleaner" || q === "cleaners") && name.includes("clean")) ||
          (q === "electrician" && name.includes("electrical"));
        const score =
          name === q
            ? 100
            : name.startsWith(q)
              ? 80
              : name.includes(q)
                ? 60
                : words.every((word) => searchable.includes(word))
                  ? 30
                  : related
                    ? 15
                    : 0;
        return { service, score };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.service.name.localeCompare(b.service.name),
      )
      .slice(0, 12)
      .map((item) => item.service);
  }, [query, services, byId]);
  const quickPicks = useMemo(
    () =>
      ["Cleaning", "Car Detailing", "Plumbing", "Electrical", "Landscaping"]
        .map((name) =>
          services.find(
            (service) => service.name.toLowerCase() === name.toLowerCase(),
          ),
        )
        .filter((item): item is ServiceDefinition => Boolean(item)),
    [services],
  );
  const metadata = (service: ServiceDefinition) =>
    `${byId[service.category_id]?.name ?? "Service"} · ${service.default_delivery_mode === "REMOTE" ? "Remote" : service.default_delivery_mode === "BOTH" ? "Local or remote" : "Local"}`;
  useEffect(() => {
    reveal.setValue(reduced ? 1 : 0);
    const animation = Animated.spring(reveal, {
      toValue: 1,
      tension: 170,
      friction: 16,
      useNativeDriver: true,
    });
    if (!reduced) animation.start();
    return () => animation.stop();
  }, [selected?.id, editing, reduced, reveal]);
  function select(service: ServiceDefinition) {
    onSelect(service);
    setEditing(false);
    setQuery("");
    input.current?.blur();
    void haptic.selection();
  }
  const text = { color: c.text };
  return (
    <Animated.View
      style={{
        gap: 12,
        opacity: reveal,
        transform: [
          {
            translateY: reveal.interpolate({
              inputRange: [0, 1],
              outputRange: [5, 0],
            }),
          },
        ],
      }}
    >
      {selected && !editing ? (
        <View
          testID="selected-service"
          style={[
            s.confirmed,
            { borderColor: c.brand, backgroundColor: c.soft },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Ionicons name="checkmark-circle" size={18} color={c.brand} />
            <Text style={[s.label, { color: c.brand }]}>SELECTED SERVICE</Text>
          </View>
          <Text style={[s.selectedName, text]}>{selected.name}</Text>
          <Text style={[s.meta, { color: c.textSecondary }]}>
            {metadata(selected)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change service"
            onPress={() => {
              setEditing(true);
              setQuery("");
              setTimeout(() => input.current?.focus(), 50);
            }}
            style={s.change}
          >
            <Text style={[s.label, { color: c.brand }]}>CHANGE</Text>
            <Ionicons name="swap-horizontal" size={16} color={c.brand} />
          </Pressable>
        </View>
      ) : (
        <>
          <View
            style={[
              s.search,
              {
                backgroundColor: c.surface,
                borderColor: focused ? c.brand : c.border,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={21}
              color={focused ? c.brand : c.muted}
            />
            <TextInput
              ref={input}
              accessibilityLabel="Search services"
              value={query}
              onChangeText={setQuery}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoCorrect={false}
              placeholder="Search detailing, plumber, cleaner…"
              placeholderTextColor={c.muted}
              style={[s.input, text,Platform.OS==='web'?({outlineStyle:'none',outlineWidth:0} as never):null]}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear service search"
                onPress={() => {
                  setQuery("");
                  input.current?.focus();
                }}
                style={s.iconButton}
              >
                <Ionicons name="close-circle" size={20} color={c.muted} />
              </Pressable>
            ) : null}
          </View>
          {selected ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditing(false)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: c.brand }}>Keep {selected.name}</Text>
            </Pressable>
          ) : null}
          {loading ? (
            <ActivityIndicator
              color={c.brand}
              accessibilityLabel="Loading services"
            />
          ) : !services.length ? (
            <View style={s.empty}>
              <Text style={[s.name, text]}>Services couldn’t be loaded</Text>
              <Pressable
                accessibilityRole="button"
                onPress={onRetry}
                style={s.iconButton}
              >
                <Text style={{ color: c.brand }}>Retry loading services</Text>
              </Pressable>
            </View>
          ) : query.trim() ? (
            results.length ? (
              <ScrollView
                testID="service-results"
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={[
                  s.results,
                  { backgroundColor: c.surface, borderColor: c.border },
                ]}
                contentContainerStyle={{ padding: 8, gap: 8 }}
              >
                {results.map((service) => (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${service.name}`}
                    accessibilityState={{
                      selected: service.id === selected?.id,
                    }}
                    onPress={() => select(service)}
                    style={({ pressed }) => [
                      s.card,
                      {
                        backgroundColor: pressed ? c.soft : c.canvas,
                        borderColor:
                          service.id === selected?.id ? c.brand : c.border,
                        transform: [{ scale: pressed && !reduced ? 0.98 : 1 }],
                      },
                    ]}
                  >
                    <View style={[s.serviceIcon, { backgroundColor: c.soft }]}>
                      <Ionicons
                        name={
                          service.default_delivery_mode === "REMOTE"
                            ? "globe-outline"
                            : "construct-outline"
                        }
                        size={20}
                        color={c.brand}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.name, text]}>{service.name}</Text>
                      <Text style={[s.meta, { color: c.muted }]}>
                        {metadata(service)}
                      </Text>
                    </View>
                    <Ionicons
                      name={
                        selected?.id === service.id
                          ? "checkmark-circle"
                          : "chevron-forward"
                      }
                      size={18}
                      color={c.brand}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View
                style={[
                  s.empty,
                  { backgroundColor: c.surface, borderColor: c.border },
                ]}
              >
                <Text style={[s.name, text]}>
                  Can’t find the exact service?
                </Text>
                <Text style={[s.meta, { color: c.textSecondary }]}>
                  Try a shorter term or explore a broader category below.
                </Text>
                <View style={s.chips}>
                  {categories
                    .filter(
                      (category) =>
                        !category.parent_id &&
                        services.some(
                          (service) =>
                            service.category_id === category.id ||
                            byId[service.category_id]?.parent_id ===
                              category.id,
                        ),
                    )
                    .slice(0, 5)
                    .map((category) => (
                      <Pressable
                        key={category.id}
                        onPress={() => setQuery(category.name)}
                        accessibilityRole="button"
                        style={[s.chip, { borderColor: c.border }]}
                      >
                        <Text style={{ color: c.text }}>{category.name}</Text>
                      </Pressable>
                    ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setQuery("");
                    input.current?.focus();
                  }}
                  style={s.iconButton}
                >
                  <Text style={{ color: c.brand }}>Search another term</Text>
                </Pressable>
              </View>
            )
          ) : quickPicks.length ? (
            <View>
              <Text style={[s.label, { color: c.muted, marginBottom: 10 }]}>
                QUICK PICKS
              </Text>
              <View style={s.chips}>
                {quickPicks.map((service) => (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    onPress={() => select(service)}
                    style={({ pressed }) => [
                      s.chip,
                      {
                        borderColor: c.border,
                        backgroundColor: pressed ? c.soft : c.surface,
                      },
                    ]}
                  >
                    <Text
                      style={{ color: c.text, fontSize: 13, fontWeight: "600" }}
                    >
                      {service.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <Text style={[s.meta, { color: c.muted }]}>
              Start typing to find your service.
            </Text>
          )}
        </>
      )}
    </Animated.View>
  );
}
const s = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 18,
    paddingLeft: 16,
    paddingRight: 5,
  },
  input: {outlineWidth:0,
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    minHeight: 56,
    paddingVertical: 14,
  },
  iconButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  results: {
    maxHeight: 320,
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  card: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  serviceIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  meta: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  confirmed: { borderWidth: 1, borderRadius: 22, padding: 20 },
  selectedName: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "800",
    marginTop: 14,
  },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  change: {
    alignSelf: "flex-start",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  empty: { padding: 18, borderWidth: 1, borderRadius: 18, gap: 12 },
});
