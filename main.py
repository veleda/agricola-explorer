from maplib import Model
import data_engineering as de
import time


m = Model()

with open("tpl/tpl.ttl", "r") as file:
    tpl = file.read()

m.add_template(tpl)
m.map(de.ns + "Card", de.cards)
m.map(de.ns + "CostPermutation", de.cost_permutations)
m.map(de.ns + "CardGain", de.card_gains)
m.map(de.ns + "CardAffect", de.card_affects)
m.map(de.ns + "CardRelation", de.card_relations)

m.read("ontology.ttl")

with open("queries/cq1_food_engines.rq", "r") as file:
    cq1_food_engines = file.read()
print(m.query(cq1_food_engines))


m.write("out.ttl", format="turtle")
#m.explore(port="1234")
#time.sleep(222)
