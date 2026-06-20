document.addEventListener("DOMContentLoaded", () => {

const items = document.querySelectorAll(".faq-item")
const searchInput = document.querySelector(".faq-search input")
const searchBtn = document.querySelector(".faq-search button")

items.forEach(item => {

  const title = item.querySelector(".faq-title")
  const content = item.querySelector(".faq-content")

  content.style.display = "none"

  title.onclick = () => {

    const isOpen = content.style.display === "block"

    document.querySelectorAll(".faq-content").forEach(c=>{
      c.style.display = "none"
    })

    if(!isOpen){
      content.style.display = "block"
    }

  }

})


function searchFAQ(){

  const value = searchInput.value.toLowerCase()

  items.forEach(item => {

    const title = item.querySelector(".faq-title").innerText.toLowerCase()
    const content = item.querySelector(".faq-content").innerText.toLowerCase()

    if(title.includes(value) || content.includes(value)){
      item.style.display = "block"
    }else{
      item.style.display = "none"
    }

  })

}

searchBtn.onclick = searchFAQ

searchInput.addEventListener("keyup", e=>{
  if(e.key === "Enter"){
    searchFAQ()
  }
})

})
